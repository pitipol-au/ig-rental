// app/dashboard/products/[id]/EditForm.tsx
//
// Every field here changes what the bot will and will not say. So
// each one carries a line explaining that consequence, rather than a
// bare label — this is the screen where "blank means not specified"
// stops being a code comment and becomes something the shop owner
// can act on.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { C, R } from '../../theme';
import { pick, type Locale } from '../../../../lib/i18n';
import type { Product } from '../../../../lib/catalog';

export default function EditForm({
  product,
  locale,
}: {
  product: Product;
  locale: Locale;
}) {
  const t = pick(locale);
  const router = useRouter();

  const [title, setTitle] = useState(product.title ?? '');
  const [price, setPrice] = useState(product.price === null ? '' : String(product.price));
  const [deposit, setDeposit] = useState(product.deposit === null ? '' : String(product.deposit));
  const [inStock, setInStock] = useState(product.inStock);
  const [colors, setColors] = useState((product.colors ?? []).join(', '));
  const [sizes, setSizes] = useState((product.sizes ?? []).join(', '));
  const [details, setDetails] = useState(product.details ?? '');
  const [notes, setNotes] = useState(product.notes ?? '');

  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

  const dirty = () => setState(s => (s === 'saved' ? 'idle' : s));

  const save = async () => {
    setState('busy');
    setError('');
    try {
      const res = await fetch('/api/products', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: product.id,
          title,
          price,
          deposit,
          inStock,
          colors,
          sizes,
          details,
          notes,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'save failed');

      // Show what was actually stored, not what was typed: "890 บาท"
      // in the price box comes back as 890.
      const p = data.product as Product;
      setPrice(p.price === null ? '' : String(p.price));
      setDeposit(p.deposit === null ? '' : String(p.deposit));
      setColors((p.colors ?? []).join(', '));
      setSizes((p.sizes ?? []).join(', '));

      setState('saved');
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'save failed');
      setState('error');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Field
        htmlFor="title"
        label={t('ชื่อสินค้า', 'Product name')}
        hint={t(
          'ชื่อที่ผู้ช่วยใช้เรียกสินค้านี้กับลูกค้า',
          'The name the assistant uses when talking to customers.'
        )}
      >
        <input
          id="title"
          value={title}
          onChange={e => { setTitle(e.target.value); dirty(); }}
          className="w-full px-3.5 outline-none"
          style={inputStyle}
        />
      </Field>

      <Field
        htmlFor="price"
        label={t('ค่าเช่า (บาท)', 'Rental fee (THB)')}
        hint={t(
          'เว้นว่างไว้ = ยังไม่มีค่าเช่า ผู้ช่วยจะไม่รับการจองสินค้านี้ให้เลย',
          'Leave it blank and the assistant will refuse to take any booking for this item.'
        )}
        warn={price.trim() === ''}
      >
        <input
          id="price"
          value={price}
          onChange={e => { setPrice(e.target.value); dirty(); }}
          inputMode="numeric"
          placeholder={t('เช่น 450', 'e.g. 450')}
          className="w-full px-3.5 outline-none"
          style={inputStyle}
        />
      </Field>

      <Field
        htmlFor="deposit"
        label={t('ค่ามัดจำ (บาท)', 'Deposit (THB)')}
        hint={t(
          'คืนได้เมื่อลูกค้าคืนชุดในสภาพเรียบร้อย เว้นว่างไว้ = ยังไม่มีค่ามัดจำ ผู้ช่วยจะไม่รับการจองสินค้านี้ให้เลย ถ้าไม่เก็บมัดจำ ให้ใส่ 0',
          'Refundable when the item comes back in good condition. Leave it blank and the assistant will refuse to take any booking for this item. Enter 0 if you charge no deposit.'
        )}
        warn={deposit.trim() === ''}
      >
        <input
          id="deposit"
          value={deposit}
          onChange={e => { setDeposit(e.target.value); dirty(); }}
          inputMode="numeric"
          placeholder={t('เช่น 200 หรือ 0', 'e.g. 200 or 0')}
          className="w-full px-3.5 outline-none"
          style={inputStyle}
        />
      </Field>

      {/* A switch, not a checkbox: a 52px target you can hit with a
          thumb, and the state is readable from across a room. */}
      <Field
        htmlFor="inStock"
        label={t('สถานะสินค้า', 'Availability')}
        hint={t(
          'ถ้าปิดไว้ ผู้ช่วยจะไม่รับออเดอร์และจะเสนอสีหรือไซส์อื่นแทน',
          'Switched off, the assistant refuses orders and offers other colours or sizes instead.'
        )}
      >
        <button
          id="inStock"
          type="button"
          onClick={() => { setInStock(v => !v); dirty(); }}
          aria-pressed={inStock}
          className="flex min-h-[52px] w-full items-center justify-between px-3.5 active:opacity-70"
          style={inputStyle}
        >
          <span className="text-[15px] font-semibold">
            {inStock ? t('มีของ', 'In stock') : t('สินค้าหมด', 'Sold out')}
          </span>
          <span
            className="relative inline-block h-7 w-12 flex-none transition-colors"
            style={{ background: inStock ? C.accent : '#CBD0CC', borderRadius: 999 }}
          >
            <span
              className="absolute top-1 h-5 w-5 bg-white transition-all"
              style={{ borderRadius: 999, left: inStock ? 26 : 4 }}
            />
          </span>
        </button>
      </Field>

      <Field
        htmlFor="colors"
        label={t('สีที่มี', 'Colours available')}
        hint={t(
          'คั่นด้วยจุลภาค เช่น ขาว, ดำ, เทา — ผู้ช่วยจะรับเฉพาะสีในรายการนี้ ไม่คิดสีใหม่ขึ้นมาเอง',
          'Comma-separated, e.g. white, black, grey. The assistant accepts only these and never invents a colour.'
        )}
      >
        <input
          id="colors"
          value={colors}
          onChange={e => { setColors(e.target.value); dirty(); }}
          placeholder={t('ขาว, ดำ, เทา', 'white, black, grey')}
          className="w-full px-3.5 outline-none"
          style={inputStyle}
        />
      </Field>

      <Field
        htmlFor="sizes"
        label={t('ไซส์ที่มี', 'Sizes available')}
        hint={t(
          'คั่นด้วยจุลภาค เช่น S, M, L, XL — ถ้าเป็นฟรีไซส์ ใส่ freesize แล้วผู้ช่วยจะไม่ถามไซส์',
          'Comma-separated, e.g. S, M, L, XL. Enter freesize and the assistant stops asking for one.'
        )}
      >
        <input
          id="sizes"
          value={sizes}
          onChange={e => { setSizes(e.target.value); dirty(); }}
          placeholder="S, M, L, XL"
          className="w-full px-3.5 outline-none"
          style={inputStyle}
        />
      </Field>

      <Field
        htmlFor="details"
        label={t('รายละเอียดเพิ่มเติม', 'Extra details')}
        hint={t(
          'ผ้า การซัก ทรง ความยืด — เว้นว่างไว้ ผู้ช่วยจะตอบว่า "ข้อมูลนี้ไม่ได้ระบุไว้" ไม่เดาเอง ตรงนี้คือที่ที่ช่วยลดคำถามซ้ำได้มากที่สุด',
          'Fabric, washing, fit, stretch. Left blank, the assistant says the information is not specified rather than guessing. This is the single best place to stop repeat questions.'
        )}
      >
        <textarea
          id="details"
          value={details}
          onChange={e => { setDetails(e.target.value); dirty(); }}
          rows={4}
          className="w-full px-3.5 py-2.5 outline-none"
          style={{ ...inputStyle, height: 'auto', lineHeight: 1.6 }}
        />
      </Field>

      <Field
        htmlFor="notes"
        label={t('หมายเหตุ', 'Notes')}
        hint={t(
          'เช่น โปรโมชั่น หรือเงื่อนไขพิเศษ ผู้ช่วยจะพูดถึงเมื่อเกี่ยวข้อง',
          'Promotions or special conditions. The assistant mentions them when relevant.'
        )}
      >
        <textarea
          id="notes"
          value={notes}
          onChange={e => { setNotes(e.target.value); dirty(); }}
          rows={2}
          className="w-full px-3.5 py-2.5 outline-none"
          style={{ ...inputStyle, height: 'auto', lineHeight: 1.6 }}
        />
      </Field>

      {/* Sticky above the tab bar, so the button is reachable without
          scrolling back up from a long details field. */}
      <div
        className="sticky bottom-20 z-10 flex flex-col gap-2 py-2"
        style={{ background: C.ground }}
      >
        <button
          onClick={save}
          disabled={state === 'busy'}
          className="w-full font-semibold text-white active:opacity-70 disabled:opacity-50"
          style={{
            background: state === 'saved' ? C.good : C.accent,
            borderRadius: R.chip,
            height: 52,
            fontSize: 16,
          }}
        >
          {state === 'busy'
            ? t('กำลังบันทึก…', 'Saving…')
            : state === 'saved'
            ? t('✓ บันทึกแล้ว', '✓ Saved')
            : t('บันทึก', 'Save')}
        </button>

        {state === 'saved' && (
          <p className="text-center text-[12.5px]" style={{ color: C.ink2 }}>
            {t(
              'ผู้ช่วยใช้ข้อมูลใหม่ภายใน 30 วินาที',
              'The assistant uses the new information within 30 seconds.'
            )}
          </p>
        )}

        {state === 'error' && (
          <p
            className="px-3.5 py-2.5 text-[13px] font-medium"
            style={{ background: C.urgentTint, color: C.urgent, borderRadius: R.chip }}
            role="alert"
          >
            {t('บันทึกไม่สำเร็จ: ', 'Could not save: ')}{error}
          </p>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.line}`,
  borderRadius: 10,
  minHeight: 52,
  fontSize: 16,   // 16px or larger stops iOS zooming the page on focus
  color: C.ink,
  width: '100%',
  textAlign: 'left',
};

function Field({
  label,
  htmlFor,
  hint,
  warn = false,
  children,
}: {
  label: string;
  /** Must match the control's id, or tapping the label does nothing
   *  and a screen reader cannot pair the two. */
  htmlFor: string;
  hint?: string;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[13px] font-semibold"
        style={{ color: warn ? C.warn : C.ink }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: C.ink3 }}>
          {hint}
        </p>
      )}
    </div>
  );
}
