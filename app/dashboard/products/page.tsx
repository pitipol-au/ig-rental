// app/dashboard/products/page.tsx — สินค้า
//
// READ-ONLY, for now. Inline editing and CSV are the next step.
//
// Shipping this read-only rather than leaving the tab empty: a tab bar
// with a dead tab is worse than no tab bar, and "which of my products
// is the bot refusing to sell" is a useful answer on its own.
//
// Products with no price are pulled to the TOP, not sorted by date.
// A missing price means the bot will not take an order for that item,
// so it is the only thing on this screen that is costing money right
// now — and it should not be somewhere down a list of eight.

import { getProducts, getIgPosts } from '../../../lib/catalog';
import { Section, Card, Row, RowList, Pill, Empty } from '../../../components/ui';
import { C } from '../theme';
import SyncButton from './SyncButton';

export const dynamic = 'force-dynamic';

export default async function Products() {
  const [rows, posts] = await Promise.all([
    getProducts().catch(() => []),
    // Instagram posts with no row yet. A dead token returns none,
    // which is the right answer — it just means we cannot tell.
    getIgPosts(100).catch(() => []),
  ]);

  const known = new Set(rows.map(r => r.igMediaId));
  const unsynced = posts.filter(p => !known.has(p.id)).length;

  const noPrice = rows.filter(r => r.price === null);
  const priced = rows.filter(r => r.price !== null);
  const ordered = [...noPrice, ...priced];

  return (
    <>
      <Section
        title={`สินค้า ${rows.length} รายการ`}
        action={<SyncButton />}
        caption="ผู้ช่วยอ่านสินค้าจากโพสต์ Instagram แล้วใช้ข้อมูลที่คุณแก้ไว้ทับ"
      >
        {unsynced > 0 && (
          <Card tone="urgent">
            <p className="text-[14px] font-semibold" style={{ color: C.urgent }}>
              มีโพสต์ใหม่ {unsynced} รายการยังไม่เข้าระบบ
            </p>
            <p className="mt-1 text-[13px] leading-relaxed" style={{ color: C.ink2 }}>
              กดดึงสินค้าด้านบน หรือรออีกไม่เกิน 10 นาที ระบบดึงให้เอง
            </p>
          </Card>
        )}

        {rows.length === 0 ? (
          <Empty
            title="ยังไม่มีสินค้าในระบบ"
            hint="กดดึงสินค้าเพื่ออ่านโพสต์จาก Instagram ผู้ช่วยจะยังไม่ตอบเรื่องสินค้าจนกว่าจะมีรายการที่นี่"
          />
        ) : (
          <RowList>
            {ordered.map((p, i) => (
              <Row
                key={p.id}
                first={i === 0}
                severity={p.price === null ? 'warn' : undefined}
                href={p.permalink || undefined}
                external
                title={p.title || 'ไม่มีชื่อสินค้า'}
                detail={
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {p.price === null ? (
                      <Pill tone="warn">ยังไม่มีราคา</Pill>
                    ) : (
                      <span className="font-semibold tabular-nums" style={{ color: C.ink }}>
                        {p.price.toLocaleString('th-TH')} บาท
                      </span>
                    )}
                    {!p.inStock && <Pill tone="urgent">หมด</Pill>}
                    {p.colors.length > 0 && <span>สี: {p.colors.join(', ')}</span>}
                    {p.sizes.length > 0 && <span>ไซส์: {p.sizes.join(', ')}</span>}
                  </span>
                }
                meta={
                  // Naming exactly what the bot will refuse to do is
                  // more useful than a generic warning icon.
                  p.price === null
                    ? 'ผู้ช่วยจะไม่รับออเดอร์สินค้านี้ให้จนกว่าจะใส่ราคา'
                    : p.colors.length === 0 && p.sizes.length === 0
                    ? 'ยังไม่มีสีและไซส์ ผู้ช่วยจะบอกลูกค้าว่าไม่ได้ระบุไว้'
                    : undefined
                }
              />
            ))}
          </RowList>
        )}
      </Section>

      <Card>
        <p className="text-[13px] leading-relaxed" style={{ color: C.ink2 }}>
          ยังแก้ในหน้านี้ไม่ได้ — กำลังทำอยู่ ถ้าต้องแก้ราคาหรือสถานะตอนนี้
          บอกผู้ติดตั้งได้เลยค่ะ
        </p>
      </Card>
    </>
  );
}
