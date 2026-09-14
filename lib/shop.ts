// lib/shop.ts
//
// Shop configuration, now a row in Postgres instead of key/value rows
// in a "Shop" tab.
//
// ─────────────────────────────────────────────────────────────
// A BUG THIS MOVE FIXES — worth reading
//
// Shipping used to live in TWO places that could disagree:
//
//   lib/shop.ts     shipping_cost, set by the seller in /setup, and
//                   spoken to the customer ("ค่าส่ง 50 บาท")
//   lib/extract.ts  SHIPPING_THB, an environment variable, used to
//   lib/ai.ts       COMPUTE the order total
//
// So a seller who set shipping to 50 in the form had the bot quote
// "ค่าส่ง 50 บาท" in conversation and then charge a total built from
// the env var's 40. The customer was told two different numbers, and
// the order row recorded the wrong one.
//
// This is the same class of mistake as the double-counted shipping
// that led to "numbers come from code, never the model" — except here
// the code itself had two sources. Now there is one: the shop row.
// SHIPPING_THB survives only as the default for a brand-new shop.
// ─────────────────────────────────────────────────────────────

import { eq } from 'drizzle-orm';
import { db, getShopId, cached, invalidate, CACHE_KEYS } from './db';
import { shops, type Shop } from './db/schema';

export type ShopConfig = {
  shop_name: string;
  sells: string;
  shipping_cost: number;
  shipping_carrier: string;
  shipping_days: string;
  free_shipping_over: number | null;
  payment_method: string;
  tone: 'polite' | 'casual';
  admin_name: string;
  hours: string;
  extra_notes: string;
};

/** Only used for a shop row that does not exist yet. */
const FALLBACK: ShopConfig = {
  shop_name: '',
  sells: 'เสื้อผ้า',
  shipping_cost: Number(process.env.SHIPPING_THB ?? 40),
  shipping_carrier: 'Flash / Kerry',
  shipping_days: '1-2 วันทำการ',
  free_shipping_over: null,
  payment_method: 'PromptPay',
  tone: 'polite',
  admin_name: 'แอดมิน',
  hours: '',
  extra_notes: '',
};

function toConfig(row: Shop): ShopConfig {
  return {
    shop_name: row.shopName,
    sells: row.sells,
    shipping_cost: row.shippingCost,
    shipping_carrier: row.shippingCarrier,
    shipping_days: row.shippingDays,
    free_shipping_over: row.freeShippingOver,
    payment_method: row.paymentMethod,
    tone: row.tone === 'casual' ? 'casual' : 'polite',
    admin_name: row.adminName,
    hours: row.hours,
    extra_notes: row.extraNotes,
  };
}

/* ─────────────────────────────────────────────────────────────
   Read
   ───────────────────────────────────────────────────────────── */

export async function getShopConfig(): Promise<ShopConfig> {
  try {
    return await cached(CACHE_KEYS.shop, async () => {
      const shopId = await getShopId();
      const [row] = await db
        .select()
        .from(shops)
        .where(eq(shops.id, shopId))
        .limit(1);
      return row ? toConfig(row) : FALLBACK;
    });
  } catch (err) {
    // Same shape of failure as before: the bot keeps talking with
    // sensible defaults rather than going silent. It will quote the
    // default shipping, which is wrong but recoverable; silence loses
    // the customer.
    console.error('Shop config read failed, using defaults:', err);
    return FALLBACK;
  }
}

/**
 * Shipping, in baht, for totals and for the prompt.
 *
 * The single source of truth. extract.ts and ai.ts both call this
 * rather than reading an env var, which is what stops the two from
 * ever disagreeing again.
 */
export async function getShippingCost(): Promise<number> {
  return (await getShopConfig()).shipping_cost;
}

/* ─────────────────────────────────────────────────────────────
   Write
   ───────────────────────────────────────────────────────────── */

/**
 * Update the shop row. Only the fields present are changed.
 *
 * The sheet version appended a new timestamped generation on every
 * save and read the newest value per key, because Sheets has no
 * "replace this row" operation — so the Shop tab grew forever and the
 * true config was whatever happened to be furthest down. This is one
 * UPDATE against one row.
 */
export async function saveShopConfig(cfg: Partial<ShopConfig>): Promise<void> {
  const shopId = await getShopId();

  const patch: Partial<typeof shops.$inferInsert> = { updatedAt: new Date() };

  if (cfg.shop_name !== undefined) patch.shopName = cfg.shop_name;
  if (cfg.sells !== undefined) patch.sells = cfg.sells;
  if (cfg.shipping_cost !== undefined) patch.shippingCost = cfg.shipping_cost;
  if (cfg.shipping_carrier !== undefined) patch.shippingCarrier = cfg.shipping_carrier;
  if (cfg.shipping_days !== undefined) patch.shippingDays = cfg.shipping_days;
  if (cfg.free_shipping_over !== undefined) patch.freeShippingOver = cfg.free_shipping_over;
  if (cfg.payment_method !== undefined) patch.paymentMethod = cfg.payment_method;
  if (cfg.tone !== undefined) patch.tone = cfg.tone;
  if (cfg.admin_name !== undefined) patch.adminName = cfg.admin_name;
  if (cfg.hours !== undefined) patch.hours = cfg.hours;
  if (cfg.extra_notes !== undefined) patch.extraNotes = cfg.extra_notes;

  await db.update(shops).set(patch).where(eq(shops.id, shopId));
  invalidate(CACHE_KEYS.shop);
}

/**
 * Turn a form post into a ShopConfig patch.
 *
 * The form sends everything as strings, including numbers. This is
 * where "40" becomes 40 and an empty free-shipping box becomes null
 * rather than 0 — 0 would mean "free shipping on every order".
 */
export function parseShopInput(body: Record<string, unknown>): Partial<ShopConfig> {
  const out: Partial<ShopConfig> = {};
  const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 500) : undefined);

  const num = (v: unknown): number | undefined => {
    const s = str(v);
    if (s === undefined) return undefined;
    const n = Number(s.replace(/[^\d.-]/g, ''));   // tolerate "40 บาท"
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
  };

  if (str(body.shop_name) !== undefined) out.shop_name = str(body.shop_name)!;
  if (str(body.sells) !== undefined) out.sells = str(body.sells)!;
  if (num(body.shipping_cost) !== undefined) out.shipping_cost = num(body.shipping_cost)!;
  if (str(body.shipping_carrier) !== undefined) out.shipping_carrier = str(body.shipping_carrier)!;
  if (str(body.shipping_days) !== undefined) out.shipping_days = str(body.shipping_days)!;

  // An empty string means the seller cleared the field: no threshold.
  if (str(body.free_shipping_over) !== undefined) {
    const s = str(body.free_shipping_over)!.trim();
    out.free_shipping_over = s === '' ? null : (num(s) ?? null);
  }

  if (str(body.payment_method) !== undefined) out.payment_method = str(body.payment_method)!;
  if (str(body.tone) !== undefined) out.tone = body.tone === 'casual' ? 'casual' : 'polite';
  if (str(body.admin_name) !== undefined) out.admin_name = str(body.admin_name)!;
  if (str(body.hours) !== undefined) out.hours = str(body.hours)!;
  if (str(body.extra_notes) !== undefined) out.extra_notes = str(body.extra_notes)!;

  return out;
}

/* ─────────────────────────────────────────────────────────────
   Prompt formatting — unchanged behaviour
   ───────────────────────────────────────────────────────────── */

/** The shop description block injected into the bot's prompt. */
export function formatShopInfo(cfg: ShopConfig): string {
  const lines: string[] = [];

  if (cfg.shop_name) lines.push(`ชื่อร้าน: ${cfg.shop_name}`);
  if (cfg.sells) lines.push(`ขาย: ${cfg.sells}`);

  const ship = [`ค่าส่ง ${cfg.shipping_cost} บาททั่วประเทศ`];
  if (cfg.shipping_carrier) ship.push(`ส่งโดย ${cfg.shipping_carrier}`);
  if (cfg.shipping_days) ship.push(`ถึงภายใน ${cfg.shipping_days}`);
  lines.push(ship.join(' '));

  if (cfg.free_shipping_over !== null && cfg.free_shipping_over > 0) {
    lines.push(`ซื้อครบ ${cfg.free_shipping_over} บาท ส่งฟรี`);
  }

  lines.push(`ชำระเงินผ่าน ${cfg.payment_method} เท่านั้น`);

  if (cfg.hours) lines.push(`เวลาทำการ: ${cfg.hours}`);
  if (cfg.extra_notes) lines.push(cfg.extra_notes);

  return lines.join('\n');
}

/** Tone instruction for the prompt. */
export function formatTone(cfg: ShopConfig): string {
  return cfg.tone === 'casual'
    ? 'พูดเป็นกันเอง สบายๆ ใช้ "จ้า/น้า" ได้ ใส่อิโมจิได้เล็กน้อย'
    : 'พูดสุภาพ เป็นทางการพอประมาณ ใช้ "ค่ะ/นะคะ"';
}
