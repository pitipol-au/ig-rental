// app/dashboard/orders/page.tsx — ออเดอร์ / Orders
//
// Unpaid first, oldest-first inside that group; everything else
// newest-first. A paid order needs nothing from the owner, while one
// unpaid since Tuesday is money that may not arrive — and the older
// it is, the likelier the customer has forgotten. Sorting purely by
// date buries exactly the row that matters.
//
// ─────────────────────────────────────────────────────────────
// SERVER HERE, CLIENT IN OrderCard
//
// This file does the reading, the sorting and — importantly — all
// the formatting. Dates, baht amounts and the item list are turned
// into finished strings here and handed down as plain text.
//
// The reason is the shop's clock. components/ui.tsx formats times in
// Asia/Bangkok from an environment variable that only exists on the
// server. Format in the browser instead and an owner checking orders
// from a hotel in London sees every timestamp shifted seven hours,
// which is the kind of bug nobody reports because it just looks like
// the app is wrong about everything.
// ─────────────────────────────────────────────────────────────

import { listOrders } from '../../../lib/orders';
import type { Order } from '../../../lib/orders';
import { getLocale, tr } from '../../../lib/i18n-server';
import { Section, Card, RowList, Empty, whenLabel, ageInDays } from '../../../components/ui';
import { C } from '../theme';
import OrderCard from './OrderCard';

export const dynamic = 'force-dynamic';

type Status = 'pending_payment' | 'paid' | 'shipped' | 'cancelled';

export default async function Orders() {
  const [locale, t, all] = await Promise.all([
    getLocale(),
    tr(),
    listOrders(200).catch(() => [] as Order[]),
  ]);

  const pending = all
    .filter(o => o.status === 'pending_payment')
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const rest = all.filter(o => o.status !== 'pending_payment');
  const owed = pending.reduce((sum, o) => sum + o.total, 0);

  const card = (o: Order, i: number) => {
    const days = ageInDays(o.createdAt);
    return (
      <OrderCard
        key={o.id}
        first={i === 0}
        orderNo={o.orderNo}
        status={o.status as Status}
        trackingNo={o.trackingNo ?? ''}
        total={o.total.toLocaleString('th-TH')}
        itemsText={itemsOf(o)}
        whenText={whenLabel(o.createdAt)}
        overdueDays={o.status === 'pending_payment' ? days : 0}
        locale={locale}
      />
    );
  };

  return (
    <>
      {pending.length > 0 && (
        <Section
          title={t(`รอชำระเงิน ${pending.length} รายการ`, `${pending.length} awaiting payment`)}
        >
          <Card tone="urgent">
            <p className="text-[13px]" style={{ color: C.ink2 }}>
              {t('ยอดที่ยังไม่ได้รับ', 'Not yet received')}
            </p>
            <p className="mt-0.5 text-[28px] font-bold leading-none">
              {owed.toLocaleString('th-TH')}
              <span className="ml-1.5 text-[15px] font-medium" style={{ color: C.ink2 }}>
                {t('บาท', 'THB')}
              </span>
            </p>
          </Card>

          <RowList>{pending.map(card)}</RowList>
        </Section>
      )}

      <Section
        title={pending.length > 0 ? t('ออเดอร์อื่น', 'Other orders') : t('ออเดอร์', 'Orders')}
      >
        {all.length === 0 ? (
          <Empty
            title={t('ยังไม่มีออเดอร์', 'No orders yet')}
            hint={t(
              'พอลูกค้ายืนยันสั่งซื้อในแชท ออเดอร์จะถูกบันทึกมาที่นี่เอง พร้อมยอดที่คำนวณไว้แล้ว',
              'When a customer confirms in chat, the order is recorded here with the total already worked out.'
            )}
          />
        ) : rest.length === 0 ? (
          <Card>
            <p className="text-[13px]" style={{ color: C.ink2 }}>
              {t('ยังไม่มีออเดอร์ที่ปิดแล้วค่ะ', 'No closed orders yet')}
            </p>
          </Card>
        ) : (
          <RowList>{rest.map(card)}</RowList>
        )}
      </Section>

      <Card>
        <p className="text-[13px] leading-relaxed" style={{ color: C.ink2 }}>
          {t(
            'เรื่องเงินผู้ช่วยไม่ยุ่งเลย — ไม่ส่งเลขบัญชี ไม่ส่ง QR ไม่ยืนยันว่าได้รับเงิน การกด "ได้รับเงินแล้ว" คือคุณยืนยันเอง หลังตรวจสลิปกับยอดในบัญชีแล้ว',
            'The assistant never touches money — no account numbers, no QR codes, and it never confirms a payment. Tapping "Payment received" is you confirming it, after checking the slip against your own balance.'
          )}
        </p>
      </Card>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   The line items

   order.items is a jsonb column — free-form JSON as far as Postgres
   is concerned. schema.ts labels it OrderItemRow[], but that label
   is a promise the code makes, not a rule the database enforces, so
   this is the one place in the app where "the type says so" is not
   good enough.

   Hence: the shape is stated here with every field optional, the
   value is checked with Array.isArray before anything is read off
   it, and every field has a fallback. A row written before a field
   existed renders as a slightly shorter line instead of crashing
   the orders page — which, since this is the screen the owner opens
   to find out who owes them money, is the behaviour that matters.
   ───────────────────────────────────────────────────────────── */

type Line = {
  title?: string;
  color?: string;
  size?: string;
  qty?: number;
};

/** "เสื้อลินิน ขาว M x2 · กระโปรง ดำ L x1" — the real line items,
 *  which is only possible because they are stored structured rather
 *  than flattened into one cell the way the spreadsheet did it. */
function itemsOf(o: Order): string {
  const lines: Line[] = Array.isArray(o.items) ? (o.items as Line[]) : [];

  return lines
    .map((line: Line) =>
      `${line.title ?? ''} ${line.color ?? ''} ${line.size ?? ''} x${line.qty ?? 1}`
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean)
    .join(' · ');
}