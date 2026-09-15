// lib/catalog.ts
//
// The catalog the bot reasons over.
//
// ─────────────────────────────────────────────────────────────
// A BEHAVIOUR CHANGE, AND WHY IT IS AN IMPROVEMENT
//
// Before: the catalog was Instagram's live posts, merged with
// override rows from the sheet. A post that Instagram had but the
// sheet did not yet know about still went into the prompt — with its
// raw caption, no authoritative price, and no colour or size
// allow-list.
//
// That is precisely the condition every hallucination came from. A
// caption reading "1190.-" with a promo strikethrough and emoji
// colour swatches, handed to a model with no allow-list, is how
// สีชมพูมิ้นท์ got invented and how an order for a non-existent 2XL
// was accepted.
//
// Now: the catalog IS the products table. A post appears to the bot
// only once sync has created its row. Sync runs every ten minutes and
// on demand, so the wait is short — and until then the bot says it
// does not have information rather than guessing from a caption.
// That is the same rule as "blank means not specified", applied to
// the product as a whole.
//
// Second benefit: captions and links are stored, so the catalog keeps
// working when the Instagram token expires. Under the old design an
// expired token emptied the catalog and the bot answered every
// product question with "ยังไม่มีสินค้าในระบบ".
// ─────────────────────────────────────────────────────────────

import { eq, and, asc } from 'drizzle-orm';
import { db, getShopId, cached, invalidate, CACHE_KEYS } from './db';
import { products, type Product } from './db/schema';

export type { Product };

/** Shape Instagram returns from /me/media. */
export type IgPost = { id: string; caption?: string; permalink: string };

/* ─────────────────────────────────────────────────────────────
   The catalog, from the database
   ───────────────────────────────────────────────────────────── */

export async function getProducts(): Promise<Product[]> {
  try {
    return await cached(CACHE_KEYS.catalog, async () => {
      const shopId = await getShopId();
      return db
        .select()
        .from(products)
        .where(eq(products.shopId, shopId))
        .orderBy(asc(products.createdAt));
    });
  } catch (err) {
    // The sheet version caught this too and fell back to raw
    // captions, which is how every hallucination got its start. There
    // is no silent fallback now: an empty catalog makes the bot say it
    // has no product information, which is true and safe.
    console.error('[CATALOG] Read failed — the bot will report no products:', err);
    return [];
  }
}

/* ─────────────────────────────────────────────────────────────
   Instagram, for sync and for the dashboard's "new posts" count
   ───────────────────────────────────────────────────────────── */

export async function getIgPosts(limit = 100): Promise<IgPost[]> {
  try {
    const token = process.env.IG_ACCESS_TOKEN;
    const res = await fetch(
      `https://graph.instagram.com/v23.0/me/media` +
      `?fields=id,caption,permalink&limit=${limit}&access_token=${token}`,
      { cache: 'no-store' }
    );
    const data = await res.json();

    if (!data.data) {
      console.error('IG media fetch failed:', JSON.stringify(data).slice(0, 300));
      return [];
    }

    return (data.data as IgPost[]).filter(p => p.caption);
  } catch (err) {
    console.error('IG media error:', err);
    return [];
  }
}

/* ─────────────────────────────────────────────────────────────
   Formatting for the model

   Unchanged in substance from the sheet version: the same explicit
   allow-lists, the same sold-out warning, the same refusal to fill a
   blank. Only where the values come from has changed.
   ───────────────────────────────────────────────────────────── */

export function formatCatalog(rows: Product[]): string {
  if (rows.length === 0) return 'ยังไม่มีสินค้าในระบบ';

  return rows
    .map((p, i) => {
      const parts = [`[สินค้าที่ ${i + 1}]`];

      // The caption still carries the descriptive text the seller
      // wrote. It is context, not authority.
      if (p.caption) parts.push(p.caption);

      // The product's own name wins over whatever the caption's first
      // line happened to be.
      if (p.title) parts.push(`ชื่อสินค้า: ${p.title}`);

      // One authoritative number. Captions carry promo
      // strikethroughs, "1190.-", and two prices in one line.
      if (p.price !== null) parts.push(`ราคาที่ถูกต้อง: ${p.price} บาท`);

      // Explicit allow-lists. Arrays now, so a colour name cannot
      // arrive as "ขาว, ดำ" pretending to be one colour.
      if (p.colors.length > 0) {
        parts.push(`สีที่มีจริงทั้งหมด (ห้ามเพิ่มสีอื่น): ${p.colors.join(', ')}`);
      }
      if (p.sizes.length > 0) {
        parts.push(`ไซส์ที่มีจริงทั้งหมด (ห้ามรับไซส์อื่น): ${p.sizes.join(', ')}`);
      }

      // Blank stays blank. The model invented washing instructions
      // and fibre composition when left with nothing to say.
      if (p.details) parts.push(`รายละเอียดเพิ่มเติม: ${p.details}`);

      if (!p.inStock) {
        parts.push('⚠️ สถานะ: สินค้าหมด — ห้ามรับออเดอร์สินค้านี้เด็ดขาด');
      }

      if (p.notes) parts.push(`หมายเหตุ: ${p.notes}`);
      if (p.permalink) parts.push(`ลิงก์: ${p.permalink}`);

      return parts.join('\n');
    })
    .join('\n\n');
}

/** The catalog block, ready for a prompt. */
export async function getFormattedCatalog(): Promise<string> {
  return formatCatalog(await getProducts());
}

/* ─────────────────────────────────────────────────────────────
   Compatibility

   getCatalog() kept under its old name so nothing that imported it
   breaks mid-migration. New code should call getProducts().
   ───────────────────────────────────────────────────────────── */

/** @deprecated use getProducts() */
export const getCatalog = getProducts;

/* ─────────────────────────────────────────────────────────────
   One product, for the edit screen
   ───────────────────────────────────────────────────────────── */

export async function getProduct(id: number): Promise<Product | null> {
  const shopId = await getShopId();
  const [row] = await db
    .select()
    .from(products)
    // Scoped to the shop, not just the id: an id from another shop
    // must come back as "not found", never as someone else's product.
    .where(and(eq(products.shopId, shopId), eq(products.id, id)))
    .limit(1);
  return row ?? null;
}

export type ProductPatch = {
  title?: string;
  /** null clears the price, which makes the bot refuse to sell it. */
  price?: number | null;
  inStock?: boolean;
  colors?: string[];
  sizes?: string[];
  details?: string;
  notes?: string;
};

/**
 * Save the seller's corrections.
 *
 * Deliberately cannot touch caption, permalink or igMediaId: those
 * belong to Instagram and sync overwrites them on every run, so
 * letting them be edited here would silently discard the edit ten
 * minutes later.
 */
export async function updateProduct(
  id: number,
  patch: ProductPatch
): Promise<Product | null> {
  const shopId = await getShopId();

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title.slice(0, 200);
  if (patch.price !== undefined) set.price = patch.price;
  if (patch.inStock !== undefined) set.inStock = patch.inStock;
  if (patch.colors !== undefined) set.colors = patch.colors;
  if (patch.sizes !== undefined) set.sizes = patch.sizes;
  if (patch.details !== undefined) set.details = patch.details.slice(0, 4000);
  if (patch.notes !== undefined) set.notes = patch.notes.slice(0, 2000);

  const [row] = await db
    .update(products)
    .set(set)
    .where(and(eq(products.shopId, shopId), eq(products.id, id)))
    .returning();

  // Without this the bot keeps quoting the old price for up to 30
  // seconds, and the seller thinks the save did not work.
  invalidate(CACHE_KEYS.catalog);
  return row ?? null;
}

/**
 * "ขาว, ดำ , เทา" -> ["ขาว","ดำ","เทา"]
 *
 * The form takes one text box because a phone keyboard plus a
 * tag-chip editor is a fight. Splitting happens here, once, so the
 * array in the database stays clean — a colour that arrives as
 * "ขาว, ดำ" in a single slot is what let the model invent a colour
 * name in the first place.
 */
export function splitTags(input: string): string[] {
  return input
    .split(/[,\n\u3001\uff0c/]/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 30);
}
