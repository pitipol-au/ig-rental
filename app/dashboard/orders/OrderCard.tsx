// app/dashboard/orders/OrderCard.tsx
//
// One order in the list, with the buttons that move it along.
//
// ─────────────────────────────────────────────────────────────
// WHY THE BUTTONS ARE HERE AND NOT ON A DETAIL SCREEN
//
// Marking an order paid is the single most repeated action in this
// whole app — it happens every time a slip arrives, all day. Putting
// it behind "tap the order, wait for a page, tap the button, go
// back" would add three steps to the one thing the owner does most.
//
// So the action sits on the row. What it costs is that a mis-tap
// would be instant, which is why every action goes through a confirm
// strip first. Two deliberate taps, no dialog box, and the question
// is written out in words: "ยืนยันว่าเงินเข้าแล้ว?" is a different
// thing to agree to than "OK".
//
// WHY EVERY MOVE IS REVERSIBLE
//
// There is an undo out of every state. A shop owner working fast on
// a phone will mark the wrong row paid sooner or later, and the
// damage is not the wrong status — it is that the order silently
// leaves the "awaiting payment" list and nobody chases the money
// again. Being able to put it back is what makes the fast path safe
// to offer at all.
//
// TELLING THE CUSTOMER
//
// Saving a tracking number can also DM it to the customer. That send
// can fail for a reason nobody here controls: Instagram only allows
// a business to message someone within 24 hours of THEIR last
// message, and a parcel posted two days after the payment slip is
// past it.
//
// So the send is reported, never assumed. Delivered says delivered.
// Refused shows the exact text with a copy button — because the
// fallback the owner actually needs is the message on their
// clipboard, ready to paste into Instagram, not an apology.
// ─────────────────────────────────────────────────────────────

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { pick, statusLabel, type Locale } from '../../../lib/i18n';
import { C, R } from '../theme';

/** Written out rather than imported from lib/db/schema, which pulls
 *  drizzle in behind it. A client component should not drag the
 *  database layer into the browser bundle. */
type Status = 'pending_deposit' | 'confirmed' | 'picked_up' | 'returned' | 'cancelled';

/** What the API reports about the DM it tried to send. */
type Notify =
  | { attempted: false }
  | { attempted: true; sent: true; text: string }
  | {
      attempted: true;
      sent: false;
      windowClosed: boolean;
      error: string;
      text: string;
    };

const TONE: Record<Status, { bg: string; fg: string }> = {
  pending_deposit: { bg: C.urgentTint, fg: C.urgent },
  confirmed: { bg: C.accentSoft, fg: C.accent },
  picked_up: { bg: C.ground, fg: C.ink2 },
  returned: { bg: C.ground, fg: C.ink3 },
  cancelled: { bg: C.ground, fg: C.ink3 },
};

type Move = {
  to: Status;
  /** [Thai, English] */
  label: [string, string];
  question: [string, string];
  look: 'primary' | 'quiet' | 'danger';
  /** Shows the tracking-number box inside the confirm strip. */
  tracking?: boolean;
};

/**
 * What you can do from where you are.
 *
 * Deliberately not a dropdown of all five statuses. The owner should
 * not have to hold a state machine in their head — each row offers
 * the one obvious next move, the way back, and cancel. Cancel is
 * absent once the item has gone out (picked_up), because by then a
 * problem is a return/damage conversation, not a status change — and
 * it disappears entirely once the item is back (returned), which is
 * the end of this booking's life.
 */
const MOVES: Record<Status, Move[]> = {
  pending_deposit: [
    {
      to: 'confirmed',
      label: ['ได้รับเงินแล้ว', 'Payment received'],
      question: [
        'ยืนยันว่าเงินเข้าบัญชีแล้ว? ตรวจสลิปกับยอดในบัญชีก่อนนะคะ',
        'Confirm the money is in your account? Check the slip against your balance first.',
      ],
      look: 'primary',
    },
    {
      to: 'cancelled',
      label: ['ยกเลิกการจอง', 'Cancel booking'],
      question: ['ยกเลิกการจองนี้?', 'Cancel this booking?'],
      look: 'danger',
    },
  ],

  confirmed: [
    {
      to: 'picked_up',
      label: ['ลูกค้ารับชุดแล้ว', 'Mark as picked up'],
      question: [
        'ใส่หมายเหตุการจัดส่ง/รับของถ้ามี แล้วกดยืนยัน — เว้นว่างไว้ก็ได้',
        'Add a delivery/pickup note if you have one, then confirm. Blank is fine.',
      ],
      look: 'primary',
      tracking: true,
    },
    {
      to: 'pending_deposit',
      label: ['ยังไม่ได้รับเงิน', 'Undo — not paid'],
      question: [
        'ย้ายกลับไปรอชำระเงิน?',
        'Move this back to awaiting payment?',
      ],
      look: 'quiet',
    },
    {
      to: 'cancelled',
      label: ['ยกเลิกการจอง', 'Cancel booking'],
      question: ['ยกเลิกการจองนี้?', 'Cancel this booking?'],
      look: 'danger',
    },
  ],

  picked_up: [
    {
      to: 'returned',
      label: ['คืนชุดแล้ว', 'Mark as returned'],
      question: [
        'ยืนยันว่าลูกค้าคืนชุดแล้ว ในสภาพเรียบร้อย? การกดนี้ไม่ได้คืนมัดจำให้อัตโนมัตินะคะ',
        'Confirm the item has been returned in good condition? This does not refund the deposit automatically.',
      ],
      look: 'primary',
    },
    {
      to: 'confirmed',
      label: ['ยังไม่ได้ส่งมอบ', 'Undo — not picked up yet'],
      question: [
        'ย้ายกลับไปยืนยันแล้ว ยังไม่ได้รับชุด?',
        'Move back to confirmed, not yet picked up?',
      ],
      look: 'quiet',
    },
  ],

  returned: [],

  cancelled: [
    {
      to: 'pending_deposit',
      label: ['นำการจองกลับมา', 'Reopen booking'],
      question: ['นำกลับมาเป็นรอชำระเงิน?', 'Put this back to awaiting payment?'],
      look: 'quiet',
    },
  ],
};

export default function OrderCard({
  orderNo,
  status: statusFromServer,
  trackingNo: trackingFromServer,
  total,
  itemsText,
  whenText,
  overdueDays,
  locale,
  first = false,
}: {
  orderNo: string;
  status: Status;
  trackingNo: string;
  /** Pre-formatted on the server, so the phone's locale cannot
   *  change how a baht amount is punctuated. */
  total: string;
  itemsText: string;
  /** Pre-formatted on the server too — the shop's clock, not the
   *  clock of whatever device is looking at it. */
  whenText: string;
  /** 0 unless this is unpaid and older than two days. */
  overdueDays: number;
  locale: Locale;
  first?: boolean;
}) {
  const t = pick(locale);
  const router = useRouter();

  const [status, setStatus] = useState<Status>(statusFromServer);
  const [tracking, setTracking] = useState(trackingFromServer);

  // Which move is waiting to be confirmed. Null means the plain
  // buttons are showing.
  const [asking, setAsking] = useState<Move | null>(null);
  const [draftTracking, setDraftTracking] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Ticked by default: the reason to save a tracking number at all
  // is so the customer knows it. Untick it when you have already
  // told them by hand.
  const [tellCustomer, setTellCustomer] = useState(true);

  // What happened to the DM, kept on screen after the strip closes.
  const [notice, setNotice] = useState<Notify | null>(null);
  const [copied, setCopied] = useState(false);

  const overdue = status === 'pending_deposit' && overdueDays >= 2;
  // Falls back rather than crashing on a status this version does not
  // know — e.g. a row written by the retail (Takma) codebase while
  // both projects share one database during prototyping.
  const tone = TONE[status] ?? TONE.cancelled;
  const moves = MOVES[status] ?? [];

  const open = (m: Move) => {
    setErr(null);
    setNotice(null);
    setCopied(false);
    setDraftTracking(tracking);
    setAsking(m);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard access is blocked in some in-app browsers. The
      // text is on screen and selectable either way, which is why
      // it is shown rather than hidden behind the button.
      setCopied(false);
    }
  };

  const commit = async (m: Move) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orderNo,
          status: m.to,
          ...(m.tracking
            ? { trackingNo: draftTracking, notify: tellCustomer }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? 'failed');

      // Trust the row that came back, not what was tapped.
      setStatus(data.order.status as Status);
      setTracking(data.order.trackingNo ?? '');
      setNotice(data.notify?.attempted ? (data.notify as Notify) : null);
      setCopied(false);
      setAsking(null);

      // Re-runs the page on the server so the totals at the top and
      // the to-do list on the home tab catch up. Without this the row
      // would change and the "awaiting payment" figure above it
      // would still be counting this order.
      router.refresh();
    } catch {
      setErr(t('บันทึกไม่สำเร็จ ลองอีกครั้งค่ะ', 'Could not save. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        borderTop: first ? 'none' : `1px solid ${C.line}`,
        background: overdue ? C.urgentTint : undefined,
      }}
    >
      <div className="flex items-start gap-3 px-4 pt-3.5">
        {overdue && (
          <>
            <span
              aria-hidden="true"
              className="mt-[7px] h-2.5 w-2.5 flex-none rounded-full"
              style={{ background: C.urgent }}
            />
            <span className="sr-only">{t('ด่วน', 'Needs attention')}</span>
          </>
        )}

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[14.5px] font-semibold leading-snug">
            <span className="tabular-nums">{orderNo}</span>
            <span
              className="inline-block whitespace-nowrap px-2 py-0.5 text-[11.5px] font-semibold"
              style={{ background: tone.bg, color: tone.fg, borderRadius: R.pill }}
            >
              {statusLabel(status, locale)}
            </span>
          </p>

          <p className="mt-0.5 text-[13px] leading-snug" style={{ color: C.ink2 }}>
            {itemsText || '—'}
          </p>

          <p className="mt-1 text-[12px] leading-snug" style={{ color: C.ink3 }}>
            {overdue
              ? t(
                  `ค้าง ${overdueDays} วัน · ${whenText}`,
                  `${overdueDays} days overdue · ${whenText}`
                )
              : whenText}
            {status === 'picked_up' && tracking && (
              <>
                {' · '}
                <span className="tabular-nums">{tracking}</span>
              </>
            )}
          </p>
        </div>

        <div className="flex-none pl-1 text-right text-[15px] font-bold tabular-nums">
          {total}
        </div>
      </div>

      {/* ── The action area ───────────────────────────────── */}
      <div className="px-4 pb-3.5 pt-2.5">
        {asking ? (
          <div
            className="flex flex-col gap-2.5 p-3"
            style={{
              background: C.surface,
              border: `1px solid ${asking.look === 'danger' ? C.urgentLine : C.line}`,
              borderRadius: R.chip,
            }}
          >
            <p className="text-[13px] leading-snug" style={{ color: C.ink2 }}>
              {t(asking.question[0], asking.question[1])}
            </p>

            {asking.tracking && (
              <>
                <input
                  value={draftTracking}
                  onChange={e => setDraftTracking(e.target.value)}
                  placeholder={t('หมายเหตุการจัดส่ง/รับของ', 'Delivery/pickup note')}
                  autoFocus
                  inputMode="text"
                  autoCapitalize="characters"
                  className="w-full px-3"
                  style={{
                    height: 44,
                    fontSize: 16,
                    color: C.ink,
                    background: C.ground,
                    border: `1px solid ${C.line}`,
                    borderRadius: R.chip,
                    outline: 'none',
                  }}
                />

                {/* A whole <label> as the hit target, not the 16px
                    box alone — a tick box on a phone is unhittable
                    otherwise. */}
                <label className="flex cursor-pointer items-start gap-2.5 py-1">
                  <input
                    type="checkbox"
                    checked={tellCustomer}
                    onChange={e => setTellCustomer(e.target.checked)}
                    className="mt-0.5 h-[18px] w-[18px] flex-none"
                    style={{ accentColor: C.accent }}
                  />
                  <span className="text-[13px] leading-snug">
                    {t('ส่งหมายเหตุนี้ให้ลูกค้าในแชท', 'Send this note to the customer')}
                    <span className="block text-[11.5px]" style={{ color: C.ink3 }}>
                      {t(
                        'ส่งได้เฉพาะเมื่อลูกค้าทักมาภายใน 24 ชม. ถ้าเกินแล้วจะมีข้อความให้คุณก๊อปไปวางเอง',
                        'Only possible if the customer messaged within 24 hours. If not, you get the text to paste yourself.'
                      )}
                    </span>
                  </span>
                </label>
              </>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => commit(asking)}
                disabled={busy}
                className="flex-1 font-semibold active:opacity-70 disabled:opacity-40"
                style={{
                  height: 44,
                  fontSize: 14.5,
                  color: '#FFFFFF',
                  background: asking.look === 'danger' ? C.urgent : C.accent,
                  border: 'none',
                  borderRadius: R.chip,
                }}
              >
                {busy ? t('กำลังบันทึก…', 'Saving…') : t('ยืนยัน', 'Confirm')}
              </button>

              <button
                type="button"
                onClick={() => setAsking(null)}
                disabled={busy}
                className="px-4 font-semibold active:opacity-70 disabled:opacity-40"
                style={{
                  height: 44,
                  fontSize: 14.5,
                  color: C.ink2,
                  background: C.surface,
                  border: `1px solid ${C.line}`,
                  borderRadius: R.chip,
                }}
              >
                {t('ย้อนกลับ', 'Back')}
              </button>
            </div>

            {err && (
              <p className="text-[12.5px] font-medium" style={{ color: C.urgent }} role="alert">
                {err}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {moves.map(m => (
              <button
                key={`${m.to}-${m.label[1]}`}
                type="button"
                onClick={() => open(m)}
                className="px-4 font-semibold active:opacity-70"
                style={{
                  // 44px is the smallest target a thumb hits reliably,
                  // and this screen gets used standing up in a shop.
                  height: 44,
                  fontSize: 14,
                  color:
                    m.look === 'primary'
                      ? '#FFFFFF'
                      : m.look === 'danger'
                        ? C.urgent
                        : C.ink2,
                  background: m.look === 'primary' ? C.accent : C.surface,
                  border: `1px solid ${
                    m.look === 'primary'
                      ? C.accent
                      : m.look === 'danger'
                        ? C.urgentLine
                        : C.line
                  }`,
                  borderRadius: R.chip,
                }}
              >
                {t(m.label[0], m.label[1])}
              </button>
            ))}
          </div>
        )}

        {/* ── What happened to the DM ─────────────────────── */}
        {notice?.attempted && notice.sent && (
          <p className="mt-2 text-[12.5px] font-medium" style={{ color: C.accent }}>
            ✓ {t('ส่งหมายเหตุให้ลูกค้าแล้ว', 'Note sent to the customer')}
          </p>
        )}

        {notice?.attempted && !notice.sent && (
          <div
            className="mt-2 flex flex-col gap-2 p-3"
            style={{ background: C.warnTint, borderRadius: R.chip }}
          >
            <p className="text-[12.5px] font-semibold" style={{ color: C.warn }}>
              {notice.windowClosed
                ? t(
                    'ส่งไม่ได้ — ลูกค้าไม่ได้ทักมาเกิน 24 ชม. แล้ว',
                    'Not sent — the customer has not messaged in over 24 hours'
                  )
                : t('ส่งข้อความไม่สำเร็จ', 'The message could not be sent')}
            </p>

            <p className="text-[12px] leading-snug" style={{ color: C.ink2 }}>
              {t(
                'การจองบันทึกเรียบร้อยแล้วนะคะ ก๊อปข้อความนี้ไปวางใน Instagram ได้เลย',
                'The booking is saved. Copy this and paste it into Instagram.'
              )}
            </p>

            {/* Shown, not hidden behind the button: clipboard access
                is blocked in some in-app browsers, and selectable
                text always works. */}
            <p
              className="whitespace-pre-wrap p-2.5 text-[12.5px] leading-relaxed"
              style={{ background: C.surface, borderRadius: R.chip, color: C.ink }}
            >
              {notice.text}
            </p>

            <button
              type="button"
              onClick={() => copy(notice.text)}
              className="self-start px-4 font-semibold active:opacity-70"
              style={{
                height: 40,
                fontSize: 13.5,
                color: C.ink,
                background: C.surface,
                border: `1px solid ${C.line}`,
                borderRadius: R.chip,
              }}
            >
              {copied ? t('ก๊อปแล้ว ✓', 'Copied ✓') : t('ก๊อปข้อความ', 'Copy message')}
            </button>

            {!notice.windowClosed && (
              <p className="text-[11.5px]" style={{ color: C.ink3 }}>
                {notice.error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}