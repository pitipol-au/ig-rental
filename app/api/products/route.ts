// app/api/products/route.ts
//
// PATCH one product. Behind the password via proxy.ts — which had to
// be updated to cover /api/products, or this would have been an open
// endpoint for editing the shop's prices.
//
// Why an API route and not a server action: the edit form needs to
// show "saving…", "saved", and a real error message, and a plain
// fetch to a route that returns JSON makes those three states
// obvious. Server actions can do it, with more machinery.

import { getProduct, updateProduct, splitTags, type ProductPatch } from '../../../lib/catalog';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request) {
  try {
    const body = await req.json();

    const id = Number(body?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ ok: false, error: 'bad id' }, { status: 400 });
    }

    const patch: ProductPatch = {};

    if (typeof body.title === 'string') patch.title = body.title.trim();

    // An empty price box means "no price", which is a real state with
    // a real consequence: the bot refuses to sell the item. It is NOT
    // the same as zero, which would be a free order.
    if (body.price !== undefined) {
      const raw = String(body.price ?? '').replace(/[^\d.]/g, '').trim();
      if (raw === '') {
        patch.price = null;
      } else {
        const n = Math.round(Number(raw));
        if (!Number.isFinite(n) || n <= 0) {
          return Response.json({ ok: false, error: 'bad price' }, { status: 400 });
        }
        patch.price = n;
      }
    }

    // Same blank-means-unset rule as price, but 0 is a valid deposit
    // (a shop that charges no deposit), not an error — unlike price,
    // which can never legitimately be free.
    if (body.deposit !== undefined) {
      const raw = String(body.deposit ?? '').replace(/[^\d.]/g, '').trim();
      if (raw === '') {
        patch.deposit = null;
      } else {
        const n = Math.round(Number(raw));
        if (!Number.isFinite(n) || n < 0) {
          return Response.json({ ok: false, error: 'bad deposit' }, { status: 400 });
        }
        patch.deposit = n;
      }
    }

    if (typeof body.inStock === 'boolean') patch.inStock = body.inStock;
    if (typeof body.colors === 'string') patch.colors = splitTags(body.colors);
    if (typeof body.sizes === 'string') patch.sizes = splitTags(body.sizes);
    if (typeof body.details === 'string') patch.details = body.details.trim();
    if (typeof body.notes === 'string') patch.notes = body.notes.trim();

    if (Object.keys(patch).length === 0) {
      return Response.json({ ok: false, error: 'nothing to update' }, { status: 400 });
    }

    const before = await getProduct(id);
    if (!before) {
      return Response.json({ ok: false, error: 'not found' }, { status: 404 });
    }

    const row = await updateProduct(id, patch);

    // Hand the saved row back so the form shows what was actually
    // stored, not what was typed. A seller who types "890 บาท" in the
    // price box should see it come back as 890.
    return Response.json({ ok: true, product: row });
  } catch (err: any) {
    console.error('Product save failed:', err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
