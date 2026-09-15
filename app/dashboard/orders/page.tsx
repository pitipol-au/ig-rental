// app/dashboard/orders/page.tsx — ออเดอร์
//
// READ-ONLY, for now. Status changes, slip and tracking are next.
//
// Unpaid orders come first, oldest first inside that group. Everything
// else is newest first. The reasoning: a paid order needs nothing from
// the owner, while an order unpaid since Tuesday is money that may not
// arrive — and the older it is, the more likely the customer has
// forgotten. Sorting purely by date buries exactly the row that
// matters.

import { listOrders } from '../../../lib/orders';
import type { Order, OrderStatus } from '../../../lib/orders';
import { Section, Card, Row, RowList, Pill, Empty, whenLabel, ageInDays } from '../../../components/ui';
import { C } from '../theme';

export const dynamic = 'force-dynamic';

const STATUS: Record<OrderStatus, { label: string; tone: 'urgent' | 'warn' | 'accent' | 'quiet' }> = {
  pending_payment: { label: 'รอชำระเงิน', tone: 'urgent' },
  paid: { label: 'จ่ายแล้ว', tone: 'accent' },
  shipped: { label: 'ส่งแล้ว', tone: 'quiet' },
  cancelled: { label: 'ยกเลิก', tone: 'quiet' },
};

export default async function Orders() {
  const all = await listOrders(200).catch(() => [] as Order[]);

  const pending = all
    .filter(o => o.status === 'pending_payment')
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const rest = all.filter(o => o.status !== 'pending_payment');

  const owed = pending.reduce((sum, o) => sum + o.total, 0);

  return (
    <>
      {pending.length > 0 && (
        <Section title={`รอชำระเงิน ${pending.length} รายการ`}>
          <Card tone="urgent">
            <p className="text-[13px]" style={{ color: C.ink2 }}>
              ยอดที่ยังไม่ได้รับ
            </p>
            <p className="mt-0.5 text-[28px] font-bold leading-none">
              {owed.toLocaleString('th-TH')}
              <span className="ml-1.5 text-[15px] font-medium" style={{ color: C.ink2 }}>
                บาท
              </span>
            </p>
          </Card>

          <RowList>
            {pending.map((o, i) => (
              <OrderRow key={o.id} order={o} first={i === 0} />
            ))}
          </RowList>
        </Section>
      )}

      <Section title={pending.length > 0 ? 'ออเดอร์อื่น' : 'ออเดอร์'}>
        {all.length === 0 ? (
          <Empty
            title="ยังไม่มีออเดอร์"
            hint="พอลูกค้ายืนยันสั่งซื้อในแชท ออเดอร์จะถูกบันทึกมาที่นี่เอง พร้อมยอดที่คำนวณไว้แล้ว"
          />
        ) : rest.length === 0 ? (
          <Card>
            <p className="text-[13px]" style={{ color: C.ink2 }}>
              ยังไม่มีออเดอร์ที่ปิดแล้วค่ะ
            </p>
          </Card>
        ) : (
          <RowList>
            {rest.map((o, i) => (
              <OrderRow key={o.id} order={o} first={i === 0} />
            ))}
          </RowList>
        )}
      </Section>

      <Card>
        <p className="text-[13px] leading-relaxed" style={{ color: C.ink2 }}>
          เรื่องเงินผู้ช่วยไม่ยุ่งเลย — ไม่ส่งเลขบัญชี ไม่ส่ง QR
          ไม่ยืนยันว่าได้รับเงิน ทั้งหมดนี้คุณทำเอง และตรวจสลิปด้วยตาทุกครั้ง
        </p>
      </Card>
    </>
  );
}

function OrderRow({ order, first }: { order: Order; first: boolean }) {
  const s = STATUS[order.status] ?? { label: order.status, tone: 'quiet' as const };
  const days = ageInDays(order.createdAt);
  const stale = order.status === 'pending_payment' && days >= 2;

  // The items are stored as structured rows, not a flattened string,
  // so the real line items can be listed instead of "3 items".
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
          <Pill tone={s.tone}>{s.label}</Pill>
        </span>
      }
      detail={items || '—'}
      meta={
        stale
          ? `ค้าง ${days} วัน · ${whenLabel(order.createdAt)}`
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
