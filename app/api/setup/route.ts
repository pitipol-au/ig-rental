// app/api/setup/route.ts
//
// Reads and writes the shop row.
//
// The allow-list of accepted keys is gone, replaced by
// parseShopInput() in lib/shop.ts. Same protection, better placed: a
// form post still cannot write a field nobody asked for, but the
// coercion from form strings to real types ("40" to 40, "" to null)
// now lives next to the schema that defines those types rather than
// in the route.

import { getShopConfig, saveShopConfig, parseShopInput } from '../../../lib/shop';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json({ ok: true, config: await getShopConfig() });
  } catch (err: any) {
    console.error('Setup read failed:', err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const patch = parseShopInput(body ?? {});

    if (Object.keys(patch).length === 0) {
      return Response.json(
        { ok: false, error: 'nothing to update' },
        { status: 400 }
      );
    }

    await saveShopConfig(patch);

    // Hand the saved row back, so the form shows what was actually
    // stored rather than what was typed. A seller who types "40 บาท"
    // in the shipping box should see it come back as 40.
    return Response.json({ ok: true, config: await getShopConfig() });
  } catch (err: any) {
    console.error('Setup save failed:', err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
