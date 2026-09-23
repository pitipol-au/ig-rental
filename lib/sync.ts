// lib/sync.ts
//
// Instagram has no "new post" webhook, so the catalog is polled.
//
// Two things changed with the move to Postgres, both worth knowing:
//
// 1. Sync used to be APPEND-ONLY, because Sheets has no upsert and
//    rewriting a row risked clobbering a stock tick the seller had
//    just made. It is still append-only FOR THE SELLER'S FIELDS —
//    price, colours, sizes, stock, details and notes are never
//    touched again after the row exists — but it now also REFRESHES
//    the caption and permalink on every run. Editing an Instagram
//    caption used to leave the bot quoting the original forever.
//
// 2. The ten-minute throttle used to be a module-level variable,
//    which does not work on serverless: every instance kept its own
//    copy, so the real interval was "ten minutes per instance" and
//    sync ran far more often than intended. It is in Redis now, which
//    is the rule the rest of this codebase already follows.
//
// Everything parsed here is still a STARTING POINT the seller
// corrects in the dashboard. The parsers below are unchanged — they
// were hard-won and they are deliberately conservative.

import { eq, and } from 'drizzle-orm';
import { db, getShopId, invalidate, CACHE_KEYS } from './db';
import { products } from './db/schema';
import { getIgPosts } from './catalog';
import { claimWindow } from './redis';

export async function syncProducts(): Promise<{
  added: number;
  refreshed: number;
  existing: number;
  titles: string[];
}> {
  const shopId = await getShopId();
  const posts = await getIgPosts(100);

  if (posts.length === 0) {
    // Either the shop has no captioned posts or the token is dead.
    // Either way there is nothing to write, and the existing rows
    // stay exactly as they are.
    return { added: 0, refreshed: 0, existing: 0, titles: [] };
  }

  const existing = await db
    .select({ igMediaId: products.igMediaId })
    .from(products)
    .where(eq(products.shopId, shopId));

  const known = new Set(existing.map(r => r.igMediaId));
  const added: string[] = [];
  let refreshed = 0;

  for (const post of posts) {
    const caption = post.caption ?? '';

    if (known.has(post.id)) {
      // Only the two fields Instagram owns. The seller's corrections
      // are never overwritten.
      await db
        .update(products)
        .set({
          caption,
          permalink: post.permalink,
          syncedAt: new Date(),
        })
        .where(
          and(eq(products.shopId, shopId), eq(products.igMediaId, post.id))
        );
      refreshed++;
      continue;
    }

    const title = guessTitle(caption);

    // onConflictDoNothing, not an existence check: two instances can
    // run sync at the same moment, and the unique index on
    // (shop_id, ig_media_id) is what actually guarantees one row per
    // post. The sheet version could only compare in memory and would
    // have written the post twice.
    const inserted = await db
      .insert(products)
      .values({
        shopId,
        igMediaId: post.id,
        title,
        price: guessPrice(caption),
        deposit: guessDeposit(caption),
        inStock: guessStock(caption),
        colors: guessColors(caption),
        sizes: guessSizes(caption),
        details: '',   // always manual, never guessed
        notes: '',
        caption,
        permalink: post.permalink,
        syncedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: products.id });

    if (inserted.length > 0) added.push(title);
  }

  if (added.length > 0 || refreshed > 0) invalidate(CACHE_KEYS.catalog);

  return {
    added: added.length,
    refreshed,
    existing: known.size,
    titles: added,
  };
}

/* ── Throttled sync ─────────────────────────────────────────────
   Piggybacks on inbound DMs. No cron needed, and DMs arrive often
   enough to keep the catalog current. Trade-off: no messages means
   no sync — acceptable, since nobody is asking about the new
   product either.
   ───────────────────────────────────────────────────────────── */

const SYNC_INTERVAL_SECONDS = 10 * 60;

export async function syncIfStale(): Promise<void> {
  // One instance per ten minutes, globally.
  if (!(await claimWindow('sync', SYNC_INTERVAL_SECONDS))) return;

  try {
    const result = await syncProducts();
    if (result.added > 0) {
      console.log(`[SYNC] added ${result.added}: ${result.titles.join(', ')}`);
    }
    if (result.refreshed > 0) {
      console.log(`[SYNC] refreshed ${result.refreshed} caption(s)`);
    }
  } catch (err) {
    console.error('[SYNC] failed:', err);
  }
}

/* ─────────────────────────────────────────────────────────────
   Caption parsing

   Unchanged from the sheet version except for return types: numbers
   and arrays instead of the strings a spreadsheet cell required.

   All of these are deliberately conservative. A blank the seller
   fills in beats a wrong value the bot quotes to a customer.
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

/** null, not 0. A price of 0 would be a free order. */
function guessPrice(caption: string): number | null {
  const promo = caption.match(/เหลือ\s*([\d,]+)/);      // "ลดจาก 1,090 เหลือ 890"
  if (promo) return toInt(promo[1]);

  const baht = caption.match(/([\d,]+)\s*บาท/);
  if (baht) return toInt(baht[1]);

  const dash = caption.match(/([\d,]+)\s*\.-/);          // "1190.-"
  if (dash) return toInt(dash[1]);

  return null;   // no confident match — leave blank for a human
}

function toInt(s: string): number | null {
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * The refundable deposit, e.g. "มัดจำ 200 บาท" or "มัดจำ 200".
 *
 * Unlike price, 0 is a real, meaningful deposit (a shop that charges
 * none) — but a caption never explicitly needs to say "มัดจำ 0" for
 * that to be true, so this still returns null on no confident match,
 * same as every other guesser here. The seller can always type 0
 * themselves once, in the dashboard, to mark it confirmed-not-charged.
 */
function guessDeposit(caption: string): number | null {
  const baht = caption.match(/มัดจำ\D{0,10}?([\d,]+)\s*บาท/);
  if (baht) return toInt(baht[1]);

  const bare = caption.match(/มัดจำ\D{0,10}?([\d,]+)/);
  if (bare) return toInt(bare[1]);

  return null;
}

/** Only applies to NEW rows — never overwrites a value set by hand. */
function guessStock(caption: string): boolean {
  const soldOut = [
    'ของหมด', 'สินค้าหมด', 'หมดแล้ว',
    'sold out', 'soldout', 'พรีออเดอร์', 'pre-order',
  ];
  const lower = caption.toLowerCase();
  return !soldOut.some(w => lower.includes(w));
}

/**
 * Colours. Thai captions usually write them one of two ways:
 *   "สีขาว / สีดำ / สีเทา"
 *   "มี 3 สีน้า 🤍🖤🩷 (ขาว/ดำ/ชมพู)"
 *
 * Returns ["ขาว", "ดำ", "เทา"] — the สี prefix is stripped so the
 * list reads cleanly when injected into the prompt.
 */
function guessColors(caption: string): string[] {
  // Colours listed inside brackets: (ขาว/ดำ/ชมพู)
  const bracket = caption.match(/\(([^)]*\/[^)]*)\)/);
  if (bracket) {
    const parts = splitList(bracket[1]);
    if (parts.length >= 2) return parts;
  }

  // A line made of สีX / สีY / สีZ
  for (const line of caption.split('\n')) {
    if (!line.includes('สี')) continue;
    if (/ราคา|บาท|ไซส์|size/i.test(line)) continue;   // not a colour line

    const parts = splitList(line)
      .map(s => s.replace(/^สี\s*/, '').trim())
      .filter(s => s && s.length <= 20);

    if (parts.length >= 2) return parts;
  }

  return [];
}

/**
 * Sizes. Usually "ไซส์ S M L XL" or "ไซส์ M L XL (โอเวอร์ไซส์)".
 * Freesize returns ["freesize"] so the bot knows not to ask.
 */
function guessSizes(caption: string): string[] {
  const lower = caption.toLowerCase();
  if (/freesize|free size|ฟรีไซส์|ฟรีไซซ์/.test(lower)) return ['freesize'];

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

    if (sizes.length >= 1) return sizes;
  }

  return [];
}

/** Split on / or , or ・ — the separators Thai captions actually use. */
function splitList(s: string): string[] {
  return s
    .split(/[\/,、・|]/)
    .map(x => x.replace(/[\u2728\u{1F525}-\u{1FAFF}]/gu, '').trim())
    .filter(Boolean);
}
