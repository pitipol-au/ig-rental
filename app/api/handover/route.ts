// app/api/handover/route.ts
//
// Give a thread back to the bot.
//
// ─────────────────────────────────────────────────────────────
// WHY THIS EXISTS
//
// The only way to release a thread used to be typing "/bot" into the
// Instagram conversation — which works, but the CUSTOMER SEES IT.
// Fine while testing, slightly embarrassing on a real shop: the buyer
// watches the owner type a command at them.
//
// This does the same thing server-side. Nothing appears in the chat.
// ─────────────────────────────────────────────────────────────
//
// It deletes the SAME Redis keys the webhook reads, not a copy: the
// handover flag and the duplicate-order guard. Clearing the order
// guard matters — without it the bot would be listening again but
// would still refuse to take a second order on that thread for 24
// hours, which looks like it is ignoring the customer.
//
// The Postgres mirror on `conversations` is updated too, so the chats
// list stops showing the thread as waiting. Redis stays the one the
// bot actually reads.

import { releaseToBot, clearOrdered } from '../../../lib/memory';
import { setHandover } from '../../../lib/conversations';

export const dynamic = 'force-dynamic';

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const customerId = String(body?.customerId ?? '').trim();

    if (!customerId) {
      return Response.json({ ok: false, error: 'bad customerId' }, { status: 400 });
    }

    await releaseToBot(customerId);
    await clearOrdered(customerId);
    await setHandover(customerId, false);

    console.log(`[BOT RESUMED] ${customerId} — released from the dashboard`);
    return Response.json({ ok: true });
  } catch (err: any) {
    console.error('Release failed:', err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
