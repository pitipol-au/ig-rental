// app/start/page.tsx
//
// The shop owner's home base. Every link they need, plus what still
// needs doing — read live rather than listed statically, so "3 items
// missing colours" is actionable instead of a reminder to go check.

import { IBM_Plex_Sans_Thai } from 'next/font/google';
import { getShopConfig } from '../../lib/shop';
import { readTable } from '../../lib/sheets';
import { getCatalog } from '../../lib/catalog';
import SyncButton from './SyncButton';

const plex = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600'],
});

export const dynamic = 'force-dynamic';

const C = {
  paper: '#F5F6F3',
  ink: '#1A1D1A',
  stamp: '#C8332E',
  pen: '#2B4C7E',
  rule: '#E2E5DE',
  muted: '#6B716A',
  good: '#3F7A52',
};

const SHEET_URL = `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit`;

type Status = { state: 'good' | 'todo' | 'unknown'; label: string };

async function loadStatus() {
  const [shop, products, orders, posts] = await Promise.all([
    getShopConfig().catch(() => null),
    readTable('Products').catch(() => []),
    readTable('Orders').catch(() => []),
    getCatalog().catch(() => []),
  ]);

  const rows = products.filter(r => String(r.ig_media_id ?? '').trim());
  const noColors = rows.filter(r => !String(r.colors ?? '').trim()).length;
  const noSizes = rows.filter(r => !String(r.sizes ?? '').trim()).length;
  const noPrice = rows.filter(r => !String(r.price ?? '').trim()).length;
  const soldOut = rows.filter(
    r => String(r.in_stock ?? '').toUpperCase() === 'FALSE'
  ).length;

  const pending = orders.filter(
    r => String(r.status ?? '').trim() === 'pending_payment'
  ).length;

  // Posts on Instagram that have no row in the sheet yet
  const known = new Set(rows.map(r => String(r.ig_media_id).trim()));
  const unsynced = posts.filter(p => !known.has(p.id)).length;

  return {
    shop,
    productCount: rows.length,
    postCount: posts.length,
    noColors, noSizes, noPrice, soldOut, pending, unsynced,
  };
}

export default async function Start() {
  const s = await loadStatus();
  const configured = Boolean(s.shop?.shop_name);

  const steps: {
    n: number;
    title: string;
    body: string;
    status: Status;
    links: { label: string; href: string; external?: boolean }[];
  }[] = [
    {
      n: 1,
      title: 'บัญชี Instagram',
      body: 'ต้องเป็นบัญชีธุรกิจเท่านั้น ถ้าเป็นครีเอเตอร์ ระบบจะรับข้อความไม่ได้',
      status: { state: 'unknown', label: 'ตรวจในแอป' },
      links: [
        { label: 'เปิด Instagram', href: 'https://www.instagram.com/', external: true },
      ],
    },
    {
      n: 2,
      title: 'ข้อมูลร้าน',
      body: 'ชื่อร้าน ค่าส่ง ช่องทางชำระเงิน และน้ำเสียงที่ใช้ตอบลูกค้า',
      status: configured
        ? { state: 'good', label: `ตั้งค่าแล้ว — ${s.shop!.shop_name}` }
        : { state: 'todo', label: 'ยังไม่ได้ตั้งค่า' },
      links: [{ label: configured ? 'แก้ไขข้อมูลร้าน' : 'ตั้งค่าร้าน', href: '/setup' }],
    },
    {
      n: 3,
      title: 'สินค้า',
      body: 'ผู้ช่วยอ่านสินค้าจากโพสต์ Instagram ของคุณ แล้วใช้ข้อมูลในตารางทับ',
      status:
        s.unsynced > 0
          ? { state: 'todo', label: `มีโพสต์ใหม่ ${s.unsynced} รายการยังไม่เข้าตาราง` }
          : s.productCount > 0
          ? { state: 'good', label: `${s.productCount} รายการในตาราง` }
          : { state: 'todo', label: 'ยังไม่มีสินค้า' },
      links: [{ label: 'เปิดตารางสินค้า', href: SHEET_URL, external: true }],
    },
    {
      n: 4,
      title: 'สี ไซส์ และราคา',
      body: 'ช่องที่ว่างไว้ ผู้ช่วยจะเดาจากแคปชั่นแทน ซึ่งบางครั้งเดาผิด',
      status:
        s.noColors + s.noSizes + s.noPrice === 0 && s.productCount > 0
          ? { state: 'good', label: 'ครบทุกรายการ' }
          : { state: 'todo', label: [
              s.noPrice && `ไม่มีราคา ${s.noPrice}`,
              s.noColors && `ไม่มีสี ${s.noColors}`,
              s.noSizes && `ไม่มีไซส์ ${s.noSizes}`,
            ].filter(Boolean).join(' · ') || 'ยังไม่มีสินค้า' },
      links: [{ label: 'เติมข้อมูลในตาราง', href: SHEET_URL, external: true }],
    },
    {
      n: 5,
      title: 'ออเดอร์',
      body: 'พอลูกค้ายืนยัน ออเดอร์จะมาอยู่ที่นี่ คุณส่งช่องทางชำระเงินและตรวจสลิปเอง',
      status:
        s.pending > 0
          ? { state: 'todo', label: `รอชำระเงิน ${s.pending} ออเดอร์` }
          : { state: 'good', label: 'ไม่มีออเดอร์ค้าง' },
      links: [{ label: 'เปิดตารางออเดอร์', href: SHEET_URL, external: true }],
    },
  ];

  return (
    <div className={plex.className} style={{ background: C.paper, minHeight: '100vh', color: C.ink }}>
      <div className="mx-auto max-w-3xl px-6 py-10 lg:py-16">

        <header className="mb-10">
          <h1 className="text-3xl font-semibold leading-tight lg:text-4xl">
            {s.shop?.shop_name || 'ร้านของคุณ'}
          </h1>
          <p className="mt-3 text-base leading-relaxed" style={{ color: C.muted }}>
            ทุกอย่างที่ต้องใช้อยู่ในหน้านี้ บุ๊กมาร์กไว้ได้เลย
          </p>
        </header>

        {/* Today — only what needs doing right now */}
        {(s.pending > 0 || s.unsynced > 0) && (
          <div className="mb-10 rounded-lg border p-5"
            style={{ borderColor: C.stamp, background: '#fff' }}>
            <h2 className="mb-2 text-base font-medium">ที่ต้องทำตอนนี้</h2>
            <ul className="space-y-1.5 text-sm leading-relaxed">
              {s.pending > 0 && (
                <li>
                  มีออเดอร์รอชำระเงิน {s.pending} รายการ —{' '}
                  <a href={SHEET_URL} target="_blank" rel="noreferrer"
                    className="underline" style={{ color: C.pen }}>ดูตารางออเดอร์</a>
                </li>
              )}
              {s.unsynced > 0 && (
                <li>
                  มีโพสต์ใหม่ {s.unsynced} รายการยังไม่เข้าตาราง — กดดึงสินค้าด้านล่าง
                </li>
              )}
            </ul>
          </div>
        )}

        <div className="space-y-8">
          {steps.map(step => (
            <section key={step.n} className="flex gap-4">
              <span className="pt-0.5 text-sm tabular-nums" style={{ color: C.stamp }}>
                {step.n}
              </span>
              <div className="flex-1 border-l pl-5" style={{ borderColor: C.rule }}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="text-lg font-medium">{step.title}</h2>
                  <StatusTag status={step.status} />
                </div>
                <p className="mt-1.5 text-sm leading-relaxed" style={{ color: C.muted }}>
                  {step.body}
                </p>
                <div className="mt-3 flex flex-wrap gap-4">
                  {step.links.map(l => (
                    <a key={l.href + l.label} href={l.href}
                      target={l.external ? '_blank' : undefined}
                      rel={l.external ? 'noreferrer' : undefined}
                      className="text-sm underline underline-offset-2"
                      style={{ color: C.pen }}>
                      {l.label}
                    </a>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>

        {/* Tools */}
        <section className="mt-12 border-t pt-8" style={{ borderColor: C.rule }}>
          <h2 className="mb-4 text-lg font-medium">เครื่องมือ</h2>
          <div className="space-y-4">
            <div>
              <SyncButton />
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: C.muted }}>
                ปกติระบบดึงให้เองทุก 10 นาที กดปุ่มนี้ถ้าเพิ่งโพสต์แล้วอยากให้เข้าทันที
              </p>
            </div>
            <div>
              <a href="/api/health" target="_blank" rel="noreferrer"
                className="text-sm underline underline-offset-2" style={{ color: C.pen }}>
                ตรวจสอบว่าระบบทำงานปกติ
              </a>
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: C.muted }}>
                ถ้าเห็น ok: true ทั้งหมด แปลว่าปกติ ถ้าไม่ ให้ส่งหน้านี้ให้ผู้ติดตั้ง
              </p>
            </div>
          </div>
        </section>

        {/* Reminders */}
        <section className="mt-12 border-t pt-8" style={{ borderColor: C.rule }}>
          <h2 className="mb-4 text-lg font-medium">จำไว้เสมอ</h2>
          <dl className="space-y-4 text-sm leading-relaxed">
            <div>
              <dt className="font-medium">อยากตอบลูกค้าเอง</dt>
              <dd style={{ color: C.muted }}>
                พิมพ์ตอบใน Instagram ตามปกติ ผู้ช่วยจะเงียบในแชทนั้นทันที
              </dd>
            </div>
            <div>
              <dt className="font-medium">อยากให้ผู้ช่วยกลับมาตอบ</dt>
              <dd style={{ color: C.muted }}>
                พิมพ์ข้อความขึ้นต้นด้วย /bot หรือรอ 24 ชั่วโมง ระบบจะกลับมาเอง
              </dd>
            </div>
            <div>
              <dt className="font-medium">ของหมด</dt>
              <dd style={{ color: C.muted }}>
                เอาเครื่องหมายถูกออกจากช่อง in_stock ในตาราง ไม่ต้องแก้แคปชั่น
                {s.soldOut > 0 && ` (ตอนนี้มี ${s.soldOut} รายการที่ตั้งว่าหมด)`}
              </dd>
            </div>
            <div>
              <dt className="font-medium">เรื่องเงิน ผู้ช่วยไม่ยุ่ง</dt>
              <dd style={{ color: C.muted }}>
                ไม่ส่งเลขบัญชี ไม่ส่ง QR ไม่ยืนยันว่าได้รับเงิน
                ทั้งหมดนี้คุณทำเอง และตรวจสลิปด้วยตาทุกครั้ง
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}

function StatusTag({ status }: { status: Status }) {
  const color =
    status.state === 'good' ? C.good : status.state === 'todo' ? C.stamp : C.muted;
  return (
    <span className="text-xs" style={{ color }}>
      {status.label}
    </span>
  );
}
