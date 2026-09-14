// app/api/setup/route.ts
import { saveShopConfig, getShopConfig } from '../../../lib/shop';

export async function GET() {
  try {
    return Response.json({ ok: true, config: await getShopConfig() });
  } catch (err: any) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Only accept known keys. A form post shouldn't be able to write
    // arbitrary rows into the sheet.
    const allowed = [
      'shop_name', 'sells', 'shipping_cost', 'shipping_carrier',
      'shipping_days', 'free_shipping_over', 'payment_method',
      'tone', 'admin_name', 'hours', 'extra_notes',
    ] as const;

    const cfg: Record<string, string> = {};
    for (const k of allowed) {
      if (typeof body[k] === 'string') cfg[k] = body[k].slice(0, 500);
    }

    await saveShopConfig(cfg);
    return Response.json({ ok: true });
  } catch (err: any) {
    console.error('Setup save failed:', err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
