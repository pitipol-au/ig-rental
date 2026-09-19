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
// ─────────────────────────────────────────────────────────────

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { pick, statusLabel, type Locale } from '../../../lib/i18n';
import { C, R } from '../theme';

/** Written out rather than imported from lib/db/schema, which pulls
 *  drizzle in behind it. A client component should not drag the
 *  database layer into the browser bundle. */
type Status = 'pending_payment' | 'paid' | 'shipped' | 'cancelled';

const TONE: Record<Status, { bg: string; fg: string }> = {
  pending_payment: { bg: C.urgentTint, fg: C.urgent },
  paid: { bg: C.accentSoft, fg: C.accent },
  shipped: { bg: C.ground, fg: C.ink2 },
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
 * Deliberately not a dropdown of all four statuses. The owner should
 * not have to hold a state machine in their head — each row offers
 * the one obvious next move, the way back, and cancel. Cancel is
 * absent once something has shipped, because by then it is a return,
 * which is a different conversation and not a status change.
 */
const MOVES: Record<Status, Move[]> = {
  pending_payment: [
    {
      to: 'paid',
      label: ['ได้รับเงินแล้ว', 'Payment received'],
      question: [
        'ยืนยันว่าเงินเข้าบัญชีแล้ว? ตรวจสลิปกับยอดในบัญชีก่อนนะคะ',
        'Confirm the money is in your account? Check the slip against your balance first.',
      ],
      look: 'primary',
    },
    {
      to: 'cancelled',
      label: ['ยกเลิกออเดอร์', 'Cancel order'],
      question: ['ยกเลิกออเดอร์นี้?', 'Cancel this order?'],
      look: 'danger',
    },
  ],

  paid: [
    {
      to: 'shipped',
      label: ['ส่งของแล้ว', 'Mark as shipped'],
      question: [
        'ใส่เลขพัสดุถ้ามี แล้วกดยืนยัน — เว้นว่างไว้ก็ได้',
        'Add the tracking number if you have one, then confirm. Blank is fine.',
      ],
      look: 'primary',
      tracking: true,
    },
    {
      to: 'pending_payment',
      label: ['ยังไม่ได้รับเงิน', 'Undo — not paid'],
      question: [
        'ย้ายกลับไปรอชำระเงิน?',
        'Move this back to awaiting payment?',
      ],
      look: 'quiet',
    },
    {
      to: 'cancelled',
      label: ['ยกเลิกออเดอร์', 'Cancel order'],
      question: ['ยกเลิกออเดอร์นี้?', 'Cancel this order?'],
      look: 'danger',
    },
  ],

  shipped: [
    {
      to: 'shipped',
      label: ['แก้เลขพัสดุ', 'Edit tracking number'],
      question: ['แก้เลขพัสดุ', 'Edit the tracking number'],
      look: 'quiet',
      tracking: true,
    },
    {
      to: 'paid',
      label: ['ยังไม่ได้ส่ง', 'Undo — not shipped'],
      question: ['ย้ายกลับไปจ่ายแล้ว ยังไม่ส่ง?', 'Move back to paid, not yet shipped?'],
      look: 'quiet',
    },
  ],

  cancelled: [
    {
      to: 'pending_payment',
      label: ['นำออเดอร์กลับมา', 'Reopen order'],
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

  const overdue = status === 'pending_payment' && overdueDays >= 2;
  const tone = TONE[status];

  const open = (m: Move) => {
    setErr(null);
    setDraftTracking(tracking);
    setAsking(m);
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
          ...(m.tracking ? { trackingNo: draftTracking } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? 'failed');

      // Trust the row that came back, not what was tapped.
      setStatus(data.order.status as Status);
      setTracking(data.order.trackingNo ?? '');
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
            {status === 'shipped' && tracking && (
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
              <input
                value={draftTracking}
                onChange={e => setDraftTracking(e.target.value)}
                placeholder={t('เลขพัสดุ', 'Tracking number')}
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
            {MOVES[status].map(m => (
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
      </div>
    </div>
  );
}