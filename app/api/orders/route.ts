// app/api/orders/route.ts
//
// PATCH one order: move it along the status line, or attach a
// tracking number.
//
// Behind the password via proxy.ts, which had to grow one more entry
// or this would be an open endpoint for marking anybody's orders
// paid.
//
// ─────────────────────────────────────────────────────────────
// WHAT THIS DELIBERATELY CANNOT DO
//
// items, subtotal, shipping and total are not accepted here, and
// lib/orders.ts would ignore them anyway. What a customer agreed to
// is a record, not a working document — if a price was wrong, the
// honest fix is to cancel and write a new order so both the mistake
// and the correction stay visible.
//
// It also does not enforce an order of statuses. The dashboard only
// offers the sensible moves, but the route accepts any of the four,
// because "I marked that paid by mistake" has to be undoable and a
// server that refuses to go backwards turns a mis-tap into a support
// call.
// ─────────────────────────────────────────────────────────────

import { updateOrder, isOrderStatus } from '../../../lib/orders';

export const dynamic = 'force-dynamic';

/** Long enough for any real courier code, short enough that a paste
 *  accident cannot put a paragraph in the column. */
const TRACKING_MAX = 64;

export async function PATCH(req: Request) {
  try {
    const body = await req.json();

    const orderNo = typeof body?.orderNo === 'string' ? body.orderNo.trim() : '';
    if (!orderNo) {
      return Response.json({ ok: false, error: 'missing orderNo' }, { status: 400 });
    }

    const patch: Parameters<typeof updateOrder>[1] = {};

    if (body.status !== undefined) {
      if (!isOrderStatus(body.status)) {
        return Response.json({ ok: false, error: 'bad status' }, { status: 400 });
      }
      patch.status = body.status;
    }

    if (body.trackingNo !== undefined) {
      // Couriers print these with spaces in them; the spaces are not
      // part of the number and make it impossible to search for.
      const raw = String(body.trackingNo ?? '').replace(/\s+/g, '').trim();
      if (raw.length > TRACKING_MAX) {
        return Response.json({ ok: false, error: 'tracking too long' }, { status: 400 });
      }
      patch.trackingNo = raw;
    }

    if (body.note !== undefined) {
      patch.note = String(body.note ?? '').trim().slice(0, 500);
    }

    if (Object.keys(patch).length === 0) {
      return Response.json({ ok: false, error: 'nothing to update' }, { status: 400 });
    }

    // updateOrder scopes the UPDATE to this shop as well as the order
    // number, so a guessed order number from another shop matches
    // nothing rather than being edited.
    const order = await updateOrder(orderNo, patch);
    if (!order) {
      return Response.json({ ok: false, error: 'not found' }, { status: 404 });
    }

    // Hand the saved row back. The card shows what was actually
    // stored rather than what was tapped — so if the tracking number
    // came back stripped of spaces, that is what appears on screen.
    return Response.json({ ok: true, order });
  } catch (err: any) {
    console.error('Order update failed:', err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}