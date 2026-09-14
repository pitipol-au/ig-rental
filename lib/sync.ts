// lib/sync.ts
//
// Instagram has no "new post" webhook, so the catalog is polled.
//
// Sync is APPEND-ONLY: rows already in the sheet are never touched,
// so stock ticks and corrected prices survive every run. Anything
// parsed here is a STARTING POINT the seller corrects by hand.

import { readTable, appendRows, invalidateCache } from './sheets';

type IgPost = { id: string; caption?: string; permalink: string };

export async function syncProducts(): Promise<{
  added: number;
  existing: number;
  titles: string[];
}> {
  const token = process.env.IG_ACCESS_TOKEN;
  const res = await fetch(
    `https://graph.instagram.com/v23.0/me/media` +
    `?fields=id,caption,permalink&limit=100&access_token=${token}`
  );
  const data = await res.json();

  if (!data.data) {
    throw new Error(`IG fetch failed: ${JSON.stringify(data).slice(0, 200)}`);
  }

  const posts: IgPost[] = data.data.filter((p: IgPost) => p.caption);

  const existing = await readTable('Products');
  const knownIds = new Set(
    existing.map(r => String(r.ig_media_id ?? '').trim()).filter(Boolean)
  );

  const newPosts = posts.filter(p => !knownIds.has(String(p.id).trim()));

  // Column order must match the sheet headers exactly — appendRow
  // writes positionally, not by name:
  // ig_media_id | title | price | in_stock | colors | sizes | details | notes
  const rows = newPosts.map(p => [
    p.id,
    guessTitle(p.caption!),
    guessPrice(p.caption!),
    guessStock(p.caption!),
    guessColors(p.caption!),
    guessSizes(p.caption!),
    '',   // details — always manual, never guessed
    '',   // notes
  ]);

  await appendRows('Products', rows);
  if (rows.length > 0) invalidateCache('Products');

  return {
    added: rows.length,
    existing: knownIds.size,
    titles: rows.map(r => String(r[1])),
  };
}

/* ── Throttled sync ─────────────────────────────────────────────
   Piggybacks on inbound DMs. No cron needed, and DMs arrive often
   enough to keep the catalog current. Trade-off: no messages means
   no sync — acceptable, since nobody is asking about the new
   product either.
   ───────────────────────────────────────────────────────────── */

let lastSyncAt = 0;
const SYNC_INTERVAL_MS = 10 * 60 * 1000;

export async function syncIfStale(): Promise<void> {
  if (Date.now() - lastSyncAt < SYNC_INTERVAL_MS) return;
  lastSyncAt = Date.now();

  try {
    const result = await syncProducts();
    if (result.added > 0) {
      console.log(`[SYNC] added ${result.added}: ${result.titles.join(', ')}`);
    }
  } catch (err) {
    console.error('[SYNC] failed:', err);
  }
}

/* ─────────────────────────────────────────────────────────────
   Caption parsing

   All of these are deliberately conservative. A blank cell the
   seller fills in beats a wrong value the bot quotes to a customer.
   ───────────────────────────────────────────────────────────── */

function guessTitle(caption: string): string {
  return caption
    .split('\n')[0]
    .replace(/[\u2728\u{1F525}\u{1F495}\u{1F338}\u274C\u2B50\u{1F4A5}]/gu, '')
    .replace(/NEW ARRIVAL/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 60);
}

function guessPrice(caption: string): string {
  const promo = caption.match(/เหลือ\s*([\d,]+)/);      // "ลดจาก 1,090 เหลือ 890"
  if (promo) return promo[1].replace(/,/g, '');

  const baht = caption.match(/([\d,]+)\s*บาท/);
  if (baht) return baht[1].replace(/,/g, '');

  const dash = caption.match(/([\d,]+)\s*\.-/);          // "1190.-"
  if (dash) return dash[1].replace(/,/g, '');

  return '';   // no confident match — leave blank for a human
}

/** Only applies to NEW rows — never overwrites a value set by hand. */
function guessStock(caption: string): string {
  const soldOut = [
    'ของหมด', 'สินค้าหมด', 'หมดแล้ว',
    'sold out', 'soldout', 'พรีออเดอร์', 'pre-order',
  ];
  const lower = caption.toLowerCase();
  return soldOut.some(w => lower.includes(w)) ? 'FALSE' : 'TRUE';
}

/**
 * Colours. Thai captions usually write them one of two ways:
 *   "สีขาว / สีดำ / สีเทา"
 *   "มี 3 สีน้า 🤍🖤🩷 (ขาว/ดำ/ชมพู)"
 *
 * Returns "ขาว, ดำ, เทา" — the สี prefix is stripped so the list
 * reads cleanly when injected into the prompt.
 */
function guessColors(caption: string): string {
  // Colours listed inside brackets: (ขาว/ดำ/ชมพู)
  const bracket = caption.match(/\(([^)]*\/[^)]*)\)/);
  if (bracket) {
    const parts = splitList(bracket[1]);
    if (parts.length >= 2) return parts.join(', ');
  }

  // A line made of สีX / สีY / สีZ
  for (const line of caption.split('\n')) {
    if (!line.includes('สี')) continue;
    if (/ราคา|บาท|ไซส์|size/i.test(line)) continue;   // not a colour line

    const parts = splitList(line)
      .map(s => s.replace(/^สี\s*/, '').trim())
      .filter(s => s && s.length <= 20);

    if (parts.length >= 2) return parts.join(', ');
  }

  return '';
}

/**
 * Sizes. Usually "ไซส์ S M L XL" or "ไซส์ M L XL (โอเวอร์ไซส์)".
 * Freesize returns "freesize" so the bot knows not to ask.
 */
function guessSizes(caption: string): string {
  const lower = caption.toLowerCase();
  if (/freesize|free size|ฟรีไซส์|ฟรีไซซ์/.test(lower)) return 'freesize';

  // Scan EVERY matching line, not just the first. "ไซส์" appears
  // inside "โอเวอร์ไซส์", so a product titled เสื้อเชิ้ตโอเวอร์ไซส์
  // would otherwise match its own title line and find no sizes.
  for (const line of caption.split('\n')) {
    if (!/ไซส์|ไซซ์|size/i.test(line)) continue;

    // Standard size tokens: S, M, L, XL, 2XL, XXL, 3XL...
    // Thai has no word boundaries, so \b is unreliable next to Thai
    // characters — match on spacing and separators instead.
    const tokens = line.match(/(?:^|[\s,/(])(\d?X{0,3}[SML])(?=[\s,/)]|$)/gi) ?? [];
    const seen = new Set<string>();
    const sizes = tokens
      .map(t => t.replace(/[^A-Za-z0-9]/g, '').toUpperCase())
      .filter(t => t && (seen.has(t) ? false : (seen.add(t), true)));

    if (sizes.length >= 1) return sizes.join(', ');
  }

  return '';
}

/** Split on / or , or ・ — the separators Thai captions actually use. */
function splitList(s: string): string[] {
  return s
    .split(/[\/,、・|]/)
    .map(x => x.replace(/[\u2728\u{1F525}-\u{1FAFF}]/gu, '').trim())
    .filter(Boolean);
}