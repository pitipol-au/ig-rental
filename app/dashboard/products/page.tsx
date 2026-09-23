// app/dashboard/products/page.tsx — สินค้า / Products
//
// Tapping a row now opens its edit screen. The Instagram post moved
// to its own small link, because the row's tap target is worth more
// as "fix this" than as "look at this".
//
// Products with no price stay pinned to the TOP rather than sorted by
// date: a missing price means the bot will not take an order for that
// item, so it is the only thing on this screen costing money right
// now.

import { getProducts, getIgPosts } from '../../../lib/catalog';
import { getLocale, tr } from '../../../lib/i18n-server';
import { Section, Card, Row, RowList, Pill, Empty } from '../../../components/ui';
import { C } from '../theme';
import SyncButton from './SyncButton';

export const dynamic = 'force-dynamic';

export default async function Products() {
  const [locale, t, rows, posts] = await Promise.all([
    getLocale(),
    tr(),
    getProducts().catch(() => []),
    getIgPosts(100).catch(() => []),
  ]);

  const known = new Set(rows.map(r => r.igMediaId));
  const unsynced = posts.filter(p => !known.has(p.id)).length;

  const incomplete = rows.filter(r => r.price === null || r.deposit === null);
  const complete = rows.filter(r => r.price !== null && r.deposit !== null);
  const ordered = [...incomplete, ...complete];

  return (
    <>
      <Section
        title={t(`สินค้า ${rows.length} รายการ`, `${rows.length} products`)}
        action={<SyncButton locale={locale} />}
        caption={t(
          'แตะที่สินค้าเพื่อแก้ราคา สี ไซส์ และรายละเอียด',
          'Tap a product to edit its price, colours, sizes and details.'
        )}
      >
        {unsynced > 0 && (
          <Card tone="urgent">
            <p className="text-[14px] font-semibold" style={{ color: C.urgent }}>
              {t(
                `มีโพสต์ใหม่ ${unsynced} รายการยังไม่เข้าระบบ`,
                `${unsynced} new posts not in the system yet`
              )}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed" style={{ color: C.ink2 }}>
              {t(
                'กดดึงสินค้าด้านบน หรือรออีกไม่เกิน 10 นาที ระบบดึงให้เอง',
                'Press Sync above, or wait up to 10 minutes and it happens by itself.'
              )}
            </p>
          </Card>
        )}

        {rows.length === 0 ? (
          <Empty
            title={t('ยังไม่มีสินค้าในระบบ', 'No products yet')}
            hint={t(
              'กดดึงสินค้าเพื่ออ่านโพสต์จาก Instagram ผู้ช่วยจะยังไม่ตอบเรื่องสินค้าจนกว่าจะมีรายการที่นี่',
              'Press Sync to read your Instagram posts. Until something is listed here, the assistant will not answer product questions.'
            )}
          />
        ) : (
          <RowList>
            {ordered.map((p, i) => (
              <Row
                key={p.id}
                first={i === 0}
                severity={p.price === null || p.deposit === null ? 'warn' : undefined}
                href={`/dashboard/products/${p.id}`}
                title={p.title || t('ไม่มีชื่อสินค้า', 'Untitled product')}
                detail={
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {p.price === null ? (
                      <Pill tone="warn">{t('ยังไม่มีค่าเช่า', 'No rental fee')}</Pill>
                    ) : (
                      <span className="font-semibold tabular-nums" style={{ color: C.ink }}>
                        {p.price.toLocaleString('th-TH')} {t('บาท', 'THB')}
                      </span>
                    )}
                    {p.deposit === null ? (
                      <Pill tone="warn">{t('ยังไม่มีมัดจำ', 'No deposit')}</Pill>
                    ) : (
                      <span style={{ color: C.ink2 }}>
                        {t('มัดจำ', 'Deposit')} {p.deposit.toLocaleString('th-TH')}
                      </span>
                    )}
                    {!p.inStock && <Pill tone="urgent">{t('หมด', 'Sold out')}</Pill>}
                    {p.colors.length > 0 && (
                      <span>{t('สี', 'Colours')}: {p.colors.join(', ')}</span>
                    )}
                    {p.sizes.length > 0 && (
                      <span>{t('ไซส์', 'Sizes')}: {p.sizes.join(', ')}</span>
                    )}
                  </span>
                }
                meta={
                  // Naming exactly what the bot will refuse to do beats
                  // a generic warning icon.
                  p.price === null || p.deposit === null
                    ? t(
                        'ผู้ช่วยจะไม่รับจองสินค้านี้ให้จนกว่าจะใส่ค่าเช่าและค่ามัดจำ',
                        'The assistant will not book this until it has both a rental fee and a deposit'
                      )
                    : p.colors.length === 0 && p.sizes.length === 0
                    ? t(
                        'ยังไม่มีสีและไซส์ ผู้ช่วยจะบอกลูกค้าว่าไม่ได้ระบุไว้',
                        'No colours or sizes set — the assistant will say they are unspecified'
                      )
                    : undefined
                }
              />
            ))}
          </RowList>
        )}
      </Section>
    </>
  );
}
