// app/dashboard/products/[id]/page.tsx
//
// One product's edit screen.
//
// ─────────────────────────────────────────────────────────────
// WHY A WHOLE SCREEN AND NOT INLINE CELLS
//
// The obvious "editable grid" is a spreadsheet, and a spreadsheet on
// a phone is a fight: tiny targets, a keyboard covering the row you
// are typing in, and no room for the one thing that actually matters
// here — an explanation of what each field does to the bot's
// behaviour.
//
// A screen per product gives full-width fields, real labels, and room
// to say "leave this blank and the assistant will tell customers it
// is not specified" next to the box where that is true.
// ─────────────────────────────────────────────────────────────

import { getProduct } from '../../../../lib/catalog';
import { getLocale, tr } from '../../../../lib/i18n-server';
import { Card, Empty, Pill } from '../../../../components/ui';
import { C } from '../../theme';
import EditForm from './EditForm';

export const dynamic = 'force-dynamic';

export default async function EditProduct({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [locale, t] = await Promise.all([getLocale(), tr()]);

  const numeric = Number(id);
  const product = Number.isInteger(numeric)
    ? await getProduct(numeric).catch(() => null)
    : null;

  if (!product) {
    return (
      <Empty
        title={t('ไม่พบสินค้านี้', 'Product not found')}
        hint={t(
          'อาจถูกลบไปแล้ว หรือยังไม่ได้ดึงเข้าระบบ',
          'It may have been removed, or not synced yet.'
        )}
        action={
          <a
            href="/dashboard/products"
            className="text-[13.5px] font-semibold"
            style={{ color: C.accent }}
          >
            {t('← กลับไปรายการสินค้า', '← Back to products')}
          </a>
        }
      />
    );
  }

  return (
    <>
      <div>
        <a
          href="/dashboard/products"
          className="text-[13.5px] font-semibold"
          style={{ color: C.accent }}
        >
          {t('← สินค้าทั้งหมด', '← All products')}
        </a>
        <h1 className="mt-2 text-[20px] font-bold leading-tight">
          {product.title || t('ไม่มีชื่อสินค้า', 'Untitled product')}
        </h1>
        {product.permalink && (
          <a
            href={product.permalink}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-[13px] font-medium underline underline-offset-4"
            style={{ color: C.ink2 }}
          >
            {t('ดูโพสต์ใน Instagram ↗', 'View the Instagram post ↗')}
          </a>
        )}
      </div>

      <EditForm product={product} locale={locale} />

      {/* The caption, read-only. It is Instagram's, and sync
          overwrites it every ten minutes — so an edit here would be
          silently thrown away. Shown because it is the text the
          assistant reads alongside your corrections. */}
      {product.caption && (
        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[12px] font-bold uppercase" style={{ color: C.ink3, letterSpacing: '0.07em' }}>
              {t('แคปชั่นจาก Instagram', 'Caption from Instagram')}
            </p>
            <Pill>{t('แก้ที่นี่ไม่ได้', 'Read-only')}</Pill>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed" style={{ color: C.ink2 }}>
            {product.caption}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed" style={{ color: C.ink3 }}>
            {t(
              'แคปชั่นเป็นของ Instagram ระบบดึงมาใหม่ทุก 10 นาที ถ้าอยากแก้ ให้แก้ที่โพสต์',
              'The caption belongs to Instagram and is re-read every 10 minutes. To change it, edit the post.'
            )}
          </p>
        </Card>
      )}
    </>
  );
}
