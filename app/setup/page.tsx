// app/setup/page.tsx
//
// Shop onboarding. The seller fills in what their shop does, and the
// bot's knowledge updates without a code change.
//
// The live preview on the right is the point, not decoration: a
// non-technical shop owner needs to SEE the bot speaking in their
// voice before they'll trust it with customers.
'use client';

import { useState } from 'react';
import { IBM_Plex_Sans_Thai } from 'next/font/google';

const plex = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600'],
});

type Config = {
  shop_name: string;
  sells: string;
  shipping_cost: string;
  shipping_carrier: string;
  shipping_days: string;
  free_shipping_over: string;
  payment_method: string;
  tone: 'polite' | 'casual';
  admin_name: string;
  hours: string;
  extra_notes: string;
};

const INITIAL: Config = {
  shop_name: '',
  sells: '',
  shipping_cost: '40',
  shipping_carrier: 'Flash / Kerry',
  shipping_days: '1-2 วันทำการ',
  free_shipping_over: '',
  payment_method: 'PromptPay',
  tone: 'polite',
  admin_name: 'แอดมิน',
  hours: '',
  extra_notes: '',
};

const C = {
  paper: '#F5F6F3',
  ink: '#1A1D1A',
  stamp: '#C8332E',
  pen: '#2B4C7E',
  rule: '#E2E5DE',
  muted: '#6B716A',
};

export default function Setup() {
  const [cfg, setCfg] = useState<Config>(INITIAL);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof Config, v: string) => {
    setCfg(c => ({ ...c, [k]: v }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Save failed');
      setSaved(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const casual = cfg.tone === 'casual';
  const p = casual ? 'จ้า' : 'ค่ะ';

  const shipLine = [
    `ค่าส่ง ${cfg.shipping_cost || '—'} บาท`,
    cfg.shipping_carrier && `ส่ง${cfg.shipping_carrier}`,
    cfg.shipping_days && `ถึงภายใน ${cfg.shipping_days}`,
  ].filter(Boolean).join(' ') + ` ${p}`;

  const freeLine = cfg.free_shipping_over
    ? ` ซื้อครบ ${cfg.free_shipping_over} บาท ส่งฟรีเลย${p}`
    : '';

  return (
    <div className={plex.className} style={{ background: C.paper, minHeight: '100vh', color: C.ink }}>
      <div className="mx-auto max-w-6xl px-6 py-10 lg:py-16">

        <header className="mb-12 max-w-xl">
          <h1 className="text-3xl font-semibold leading-tight lg:text-4xl">
            ตั้งค่าร้านของคุณ
          </h1>
          <p className="mt-3 text-base leading-relaxed" style={{ color: C.muted }}>
            กรอกข้อมูลร้าน แล้วผู้ช่วยจะตอบลูกค้าแทนคุณได้ทันที
            ดูตัวอย่างคำตอบทางขวาได้เลยขณะกรอก
          </p>
        </header>

        <div className="grid gap-12 lg:grid-cols-[1fr_380px] lg:gap-16">

          {/* ── Form ────────────────────────────────────────── */}
          <div className="space-y-10">

            <Section n={1} title="ร้านของคุณ">
              <Field label="ชื่อร้าน" value={cfg.shop_name}
                onChange={v => set('shop_name', v)} placeholder="เช่น Baan Linen" />
              <Field label="ขายอะไร" value={cfg.sells}
                onChange={v => set('sells', v)} placeholder="เช่น เสื้อผ้าผู้หญิง งานลินิน" />
            </Section>

            <Section n={2} title="การจัดส่ง">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="ค่าส่ง (บาท)" value={cfg.shipping_cost}
                  onChange={v => set('shipping_cost', v)} placeholder="40" />
                <Field label="ส่งฟรีเมื่อซื้อครบ (บาท)" value={cfg.free_shipping_over}
                  onChange={v => set('free_shipping_over', v)}
                  placeholder="เว้นว่างถ้าไม่มี" optional />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="ขนส่ง" value={cfg.shipping_carrier}
                  onChange={v => set('shipping_carrier', v)} placeholder="Flash / Kerry" />
                <Field label="ใช้เวลา" value={cfg.shipping_days}
                  onChange={v => set('shipping_days', v)} placeholder="1-2 วันทำการ" />
              </div>
            </Section>

            <Section n={3} title="การชำระเงิน">
              <Field label="ช่องทาง" value={cfg.payment_method}
                onChange={v => set('payment_method', v)} placeholder="PromptPay" />
              <Note>
                ผู้ช่วยจะไม่ส่งเลขบัญชีหรือ QR ให้ลูกค้าเอง
                เมื่อลูกค้าถามเรื่องโอนเงิน ระบบจะส่งต่อให้คุณตอบเสมอ
              </Note>
            </Section>

            <Section n={4} title="น้ำเสียง">
              <div className="flex gap-3">
                <Choice active={!casual} onClick={() => set('tone', 'polite')}
                  title="สุภาพ" sample="สวัสดีค่ะ สนใจสินค้าชิ้นไหนดีคะ" />
                <Choice active={casual} onClick={() => set('tone', 'casual')}
                  title="เป็นกันเอง" sample="สวัสดีจ้า สนใจตัวไหนบอกได้เลยน้า" />
              </div>
            </Section>

            <Section n={5} title="เมื่อต้องส่งต่อให้คุณ">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="เรียกคุณว่า" value={cfg.admin_name}
                  onChange={v => set('admin_name', v)} placeholder="แอดมิน" />
                <Field label="เวลาทำการ" value={cfg.hours}
                  onChange={v => set('hours', v)} placeholder="9:00-20:00 ทุกวัน" optional />
              </div>
              <Field label="อย่างอื่นที่ลูกค้าถามบ่อย" value={cfg.extra_notes}
                onChange={v => set('extra_notes', v)}
                placeholder="เช่น เปลี่ยนไซส์ได้ภายใน 7 วัน" optional multiline />
            </Section>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button onClick={save} disabled={saving}
                className="rounded px-6 py-3 text-base font-medium text-white transition-opacity disabled:opacity-50"
                style={{ background: C.ink }}>
                {saving ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}
              </button>
              {saved && (
                <span className="text-sm font-medium" style={{ color: C.pen }}>
                  บันทึกแล้ว ผู้ช่วยใช้ข้อมูลนี้ทันที
                </span>
              )}
              {error && (
                <span className="text-sm" style={{ color: C.stamp }}>
                  บันทึกไม่สำเร็จ: {error}
                </span>
              )}
            </div>
          </div>

          {/* ── Live preview ─────────────────────────────────── */}
          <aside className="lg:sticky lg:top-16 lg:self-start">
            <div className="mb-4 flex items-baseline justify-between">
              <span className="text-sm font-medium">ตัวอย่างการตอบ</span>
              <span className="text-xs" style={{ color: C.muted }}>
                {cfg.shop_name || 'ร้านของคุณ'}
              </span>
            </div>

            <div className="rounded-lg border p-4" style={{ borderColor: C.rule, background: '#fff' }}>
              <Bubble from="customer">สวัสดีค่ะ</Bubble>
              <Bubble from="shop">
                {casual
                  ? `สวัสดีจ้า ${cfg.sells ? `ร้านเราขาย${cfg.sells}น้า ` : ''}สนใจตัวไหนบอกได้เลย`
                  : `สวัสดีค่ะ ${cfg.sells ? `ร้านเราขาย${cfg.sells}นะคะ ` : ''}สนใจสินค้าชิ้นไหนดีคะ`}
              </Bubble>

              <Bubble from="customer">ค่าส่งเท่าไหร่</Bubble>
              <Bubble from="shop">{shipLine}{freeLine}</Bubble>

              <Bubble from="customer">โอนยังไง</Bubble>
              <Bubble from="shop">
                {`รับชำระผ่าน ${cfg.payment_method || '—'} ${p} เดี๋ยว${cfg.admin_name || 'แอดมิน'}ส่งช่องทางชำระเงินให้นะ`}
              </Bubble>

              <div className="mt-3 border-t pt-3 text-xs leading-relaxed"
                style={{ borderColor: C.rule, color: C.muted }}>
                ตรงนี้ระบบส่งต่อให้คุณตอบเอง เพราะเกี่ยวกับการเงิน
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────────────────── */

function Section({ n, title, children }: {
  n: number; title: string; children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-baseline gap-3">
        <span className="text-sm tabular-nums" style={{ color: C.stamp }}>{n}</span>
        <h2 className="text-lg font-medium">{title}</h2>
      </div>
      <div className="space-y-4 border-l pl-6" style={{ borderColor: C.rule }}>
        {children}
      </div>
    </section>
  );
}

function Field({ label, value, onChange, placeholder, optional, multiline }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; optional?: boolean; multiline?: boolean;
}) {
  const shared = {
    value,
    placeholder,
    onChange: (e: any) => onChange(e.target.value),
    className: 'w-full rounded border bg-white px-3 py-2 text-base outline-none transition-colors focus:border-current',
    style: { borderColor: C.rule, color: C.ink },
  };
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm" style={{ color: C.muted }}>
        {label}{optional && <span className="ml-1.5 text-xs">ไม่บังคับ</span>}
      </span>
      {multiline ? <textarea rows={2} {...shared} /> : <input type="text" {...shared} />}
    </label>
  );
}

function Choice({ active, onClick, title, sample }: {
  active: boolean; onClick: () => void; title: string; sample: string;
}) {
  return (
    <button onClick={onClick}
      className="flex-1 rounded border px-4 py-3 text-left transition-colors"
      style={{
        borderColor: active ? C.ink : C.rule,
        background: active ? '#fff' : 'transparent',
      }}>
      <span className="block text-sm font-medium">{title}</span>
      <span className="mt-1 block text-xs leading-relaxed" style={{ color: C.muted }}>
        {sample}
      </span>
    </button>
  );
}

function Bubble({ from, children }: { from: 'customer' | 'shop'; children: React.ReactNode }) {
  const shop = from === 'shop';
  return (
    <div className={`mb-2 flex ${shop ? 'justify-start' : 'justify-end'}`}>
      <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed"
        style={{
          background: shop ? C.paper : C.pen,
          color: shop ? C.ink : '#fff',
        }}>
        {children}
      </div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
      {children}
    </p>
  );
}
