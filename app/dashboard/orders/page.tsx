// app/dashboard/orders/page.tsx — ออเดอร์ / Orders
//
// Unpaid first, oldest-first inside that group; everything else
// newest-first. A paid order needs nothing from the owner, while one
// unpaid since Tuesday is money that may not arrive — and the older
// it is, the likelier the customer has forgotten. Sorting purely by
// date buries exactly the row that matters.

import { listOrders } from '../../../lib/orders';
import type { Order } from '../../../lib/orders';
import { getLocale, tr } from '../../../lib/i18n-server';
import { statusLabel, pick, type Locale } from '../../../lib/i18n';
import {
  Section, Card, Row, RowList, Pill, Empty, whenLabel, ageInDays,
} from '../../../components/ui';
import { C } from '../theme';

export const dynamic = 'force-dynamic';

const TONE: Record<string, 'urgent' | 'accent' | 'quiet'> = {
  pending_payment: 'urgent',
  paid: 'accent',
  shipped: 'quiet',
  cancelled: 'quiet',
};

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

          <RowList>
            {pending.map((o, i) => (
              <OrderRow key={o.id} order={o} first={i === 0} locale={locale} />
            ))}
          </RowList>
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
          <RowList>
            {rest.map((o, i) => (
              <OrderRow key={o.id} order={o} first={i === 0} locale={locale} />
            ))}
          </RowList>
        )}
      </Section>

      <Card>
        <p className="text-[13px] leading-relaxed" style={{ color: C.ink2 }}>
          {t(
            'เรื่องเงินผู้ช่วยไม่ยุ่งเลย — ไม่ส่งเลขบัญชี ไม่ส่ง QR ไม่ยืนยันว่าได้รับเงิน ทั้งหมดนี้คุณทำเอง และตรวจสลิปด้วยตาทุกครั้ง',
            'The assistant never touches money — no account numbers, no QR codes, and it never confirms a payment. You do all of that, and you check every slip yourself.'
          )}
        </p>
      </Card>
    </>
  );
}

function OrderRow({
  order, first, locale,
}: {
  order: Order; first: boolean; locale: Locale;
}) {
  const t = pick(locale);
  const days = ageInDays(order.createdAt);
  const stale = order.status === 'pending_payment' && days >= 2;

  // Items are stored structured, not flattened to a string, so the
  // real line items can be listed rather than "3 items".
  const items = (order.items ?? [])
    .map(i => `${i.title} ${i.color} ${i.size} x${i.qty}`.replace(/\s+/g, ' ').trim())
    .join(' · ');

  return (
    <Row
      first={first}
      severity={stale ? 'urgent' : undefined}
      title={
        <span className="flex items-center gap-2">
          <span className="tabular-nums">{order.orderNo}</span>
          <Pill tone={TONE[order.status] ?? 'quiet'}>
            {statusLabel(order.status, locale)}
          </Pill>
        </span>
      }
      detail={items || '—'}
      meta={
        stale
          ? t(
              `ค้าง ${days} วัน · ${whenLabel(order.createdAt)}`,
              `${days} days overdue · ${whenLabel(order.createdAt)}`
            )
          : whenLabel(order.createdAt)
      }
      right={
        <span className="text-[15px] font-bold tabular-nums">
          {order.total.toLocaleString('th-TH')}
        </span>
      }
    />
  );
}
