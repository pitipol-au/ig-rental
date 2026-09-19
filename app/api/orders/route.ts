// app/api/orders/route.ts
//
// PATCH one order: move it along the status line, attach a tracking
// number, and — when asked to — tell the customer.
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
//
// ─────────────────────────────────────────────────────────────
// THE ORDER IS SAVED BEFORE THE MESSAGE IS SENT
//
// Two things happen here and only one of them is reliable. Writing
// the status to Postgres always works. Sending a DM depends on
// Instagram's 24-hour window, which is outside anyone's control.
//
// So the write happens first and is never rolled back if the send
// fails. The alternative — refusing to record that a parcel shipped
// because Meta would not deliver a notification about it — would let
// a messaging limitation corrupt the shop's own records.
//
// The send result is reported separately in the response, so the
// dashboard can show "saved, but not delivered" as the honest two-part
// outcome it is.
// ─────────────────────────────────────────────────────────────

import { updateOrder, isOrderStatus } from '../../../lib/orders';
import { sendDM, threadLang, shippedMessage } from '../../../lib/messenger';
import { logMessage } from '../../../lib/conversations';
import { getShopConfig } from '../../../lib/shop';

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

    const notify = await maybeTellCustomer({
      wanted: body.notify === true,
      orderNo: order.orderNo,
      customerId: order.customerId,
      tracking: order.trackingNo ?? '',
    });

    // Hand the saved row back. The card shows what was actually
    // stored rather than what was tapped — so if the tracking number
    // came back stripped of spaces, that is what appears on screen.
    return Response.json({ ok: true, order, notify });
  } catch (err: any) {
    console.error('Order update failed:', err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}

/* ─────────────────────────────────────────────────────────────
   Telling the customer
   ───────────────────────────────────────────────────────────── */

type Notify =
  | { attempted: false }
  | { attempted: true; sent: true; text: string }
  | {
      attempted: true;
      sent: false;
      /** True when Meta refused because the 24-hour window is shut,
       *  which is an ordinary outcome and not a fault. */
      windowClosed: boolean;
      error: string;
      /** Handed back so the owner can paste it into Instagram. */
      text: string;
    };

async function maybeTellCustomer(opts: {
  wanted: boolean;
  orderNo: string;
  customerId: string;
  tracking: string;
}): Promise<Notify> {
  // No tracking number, nothing to tell them. This is why the
  // checkbox being ticked with an empty box is harmless.
  if (!opts.wanted || !opts.tracking) return { attempted: false };

  // The customer's own language, not the dashboard's. The owner may
  // be reading the dashboard in English while the thread is Thai.
  const [lang, shop] = await Promise.all([
    threadLang(opts.customerId),
    getShopConfig().catch(() => null),
  ]);

  const text = shippedMessage({
    orderNo: opts.orderNo,
    tracking: opts.tracking,
    carrier: shop?.shipping_carrier ?? '',
    lang,
  });

  const result = await sendDM(opts.customerId, text);

  if (!result.ok) {
    return {
      attempted: true,
      sent: false,
      windowClosed: result.windowClosed,
      error: result.error,
      text,
    };
  }

  // Logged so it appears in the thread on the แชท tab. The webhook
  // will not log it: sendDM marks it as ours, and the echo Meta
  // sends back is dropped as a duplicate.
  //
  // Recorded as a bot message because the system composed and sent
  // it. 'human' is reserved for what the seller types inside
  // Instagram itself.
  await logMessage({ customerId: opts.customerId, role: 'bot', text }).catch(() => {});

  return { attempted: true, sent: true, text };
}