// lib/shop.ts
//
// Shop configuration, stored as key/value rows in a "Shop" tab.
//
// Previously SHOP_INFO was hardcoded in ai.ts, which meant every
// change was a code change. Now the seller fills in a form and the
// bot's knowledge updates without a deploy.

import { readTableCached, appendRow, readTable } from './sheets';

export type ShopConfig = {
  shop_name: string;
  sells: string;
  shipping_cost: string;
  shipping_carrier: string;
  shipping_days: string;
  free_shipping_over: string;
  payment_method: string;
  tone: string;
  admin_name: string;
  hours: string;
  extra_notes: string;
};

const DEFAULTS: ShopConfig = {
  shop_name: '',
  sells: 'เสื้อผ้า',
  shipping_cost: '40',
  shipping_carrier: 'Flash / Kerry',
  shipping_days: '1-2 วันทำการ',
  free_shipping_over: '',
  payment_method: 'PromptPay',
  tone: 'polite',
  admin_name: 'แอดมิน',
  hours: '',
  extra_notes: '',
};

export async function getShopConfig(): Promise<ShopConfig> {
  try {
    const rows = await readTableCached('Shop');
    const cfg = { ...DEFAULTS };

    for (const r of rows) {
      const key = String(r.key ?? '').trim() as keyof ShopConfig;
      const value = String(r.value ?? '').trim();
      if (key in cfg && value) (cfg as any)[key] = value;
    }

    return cfg;
  } catch (err) {
    console.error('Shop config read failed, using defaults:', err);
    return DEFAULTS;
  }
}

/**
 * Overwrite the Shop tab. Key/value rows rather than columns, so
 * adding a setting later doesn't mean restructuring the sheet.
 */
export async function saveShopConfig(cfg: Partial<ShopConfig>): Promise<void> {
  const existing = await readTable('Shop').catch(() => []);
  const merged: Record<string, string> = { ...DEFAULTS };

  for (const r of existing) {
    const k = String(r.key ?? '').trim();
    if (k) merged[k] = String(r.value ?? '');
  }
  for (const [k, v] of Object.entries(cfg)) {
    if (v !== undefined) merged[k] = String(v);
  }

  // Sheets has no "replace all rows" operation, so we append a
  // timestamped generation and read the newest value per key.
  // Simpler and safer than deleting rows under a live bot.
  for (const [k, v] of Object.entries(merged)) {
    await appendRow('Shop', [k, v, new Date().toISOString()]);
  }
}

/** The shop description block injected into the bot's prompt. */
export function formatShopInfo(cfg: ShopConfig): string {
  const lines: string[] = [];

  if (cfg.shop_name) lines.push(`ชื่อร้าน: ${cfg.shop_name}`);
  if (cfg.sells) lines.push(`ขาย: ${cfg.sells}`);

  const ship = [`ค่าส่ง ${cfg.shipping_cost} บาททั่วประเทศ`];
  if (cfg.shipping_carrier) ship.push(`ส่งโดย ${cfg.shipping_carrier}`);
  if (cfg.shipping_days) ship.push(`ถึงภายใน ${cfg.shipping_days}`);
  lines.push(ship.join(' '));

  if (cfg.free_shipping_over) {
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
