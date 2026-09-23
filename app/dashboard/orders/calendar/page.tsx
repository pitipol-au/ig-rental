// app/dashboard/orders/calendar/page.tsx — ปฏิทินเช่าชุด / Rental calendar
//
// The one feature the whole rental project was started to build: which
// item is out on which dates, at a glance, so the owner never accepts
// a booking that collides with one already on the books.
//
// isAvailable() in lib/orders.ts is the code that actually PREVENTS a
// collision at booking time — this page is the read-only view of the
// same data, for a human scanning a month rather than checking one
// item on one date.
//
// Plain 'YYYY-MM-DD' string arithmetic throughout, never a timezone
// conversion: startDate/endDate are stored as local calendar dates
// with no time component (see lib/db/schema.ts), so there is no UTC
// boundary to get wrong here — unlike lib/digest.ts's dayRange(),
// which has to convert a local day into a UTC window because it
// filters a `timestamp` column instead.

import { listBookingsInRange } from '../../../../lib/orders';
import { listConversations, customerLabel } from '../../../../lib/conversations';
import { getLocale, tr } from '../../../../lib/i18n-server';
import { Section, Card, Empty } from '../../../../components/ui';
import { C, R } from '../../theme';
import type { Order } from '../../../../lib/orders';

export const dynamic = 'force-dynamic';

const MONTH_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
const MONTH_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const WEEKDAY_EN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'YYYY-MM' -> {year, month} (month is 1-12). Falls back to the
 *  current month for anything malformed, so a hand-edited URL can
 *  never produce a blank or crashing page. */
function parseMonth(param: string | undefined): { year: number; month: number } {
  const m = param?.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month >= 1 && month <= 12) return { year, month };
  }
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

function daysInMonth(year: number, month: number): number {
  // Day 0 of the NEXT month is the last day of THIS month.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 0 (Sunday) - 6 (Saturday), for the 1st of the month. */
function firstWeekday(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

export default async function BookingCalendar({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const { year, month } = parseMonth(monthParam);

  const monthStart = `${year}-${pad2(month)}-01`;
  const monthEnd = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`;

  const [locale, t, bookings, conversations] = await Promise.all([
    getLocale(),
    tr(),
    listBookingsInRange(monthStart, monthEnd).catch(() => [] as Order[]),
    listConversations(500).catch(() => []),
  ]);

  const nameOf = new Map(conversations.map(c => [c.customerId, customerLabel(c)]));

  // Every booking, exploded into one entry per day it covers WITHIN
  // this month — a booking that starts last month or ends next month
  // is clamped to the visible range, so the grid never has to render
  // a day outside its own month.
  const byDay = new Map<string, { title: string; who: string; orderNo: string }[]>();
  for (const b of bookings) {
    const items = Array.isArray(b.items) ? b.items : [];
    const titles = items.map(i => i.title).filter(Boolean);
    const who = nameOf.get(b.customerId) ?? b.customerId;

    const from = b.startDate > monthStart ? b.startDate : monthStart;
    const to = b.endDate < monthEnd ? b.endDate : monthEnd;

    for (let d = from; d <= to; d = addDay(d)) {
      const entry = { title: titles.join(', ') || '—', who, orderNo: b.orderNo };
      const list = byDay.get(d);
      if (list) list.push(entry);
      else byDay.set(d, [entry]);
    }
  }

  const todayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.SHOP_TIMEZONE ?? 'Asia/Bangkok',
  }).format(new Date());

  const total = daysInMonth(year, month);
  const leading = firstWeekday(year, month);
  const cells: (string | null)[] = [
    ...Array(leading).fill(null),
    ...Array.from({ length: total }, (_, i) => `${year}-${pad2(month)}-${pad2(i + 1)}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const weekday = locale === 'en' ? WEEKDAY_EN : WEEKDAY_TH;
  const monthName = locale === 'en' ? MONTH_EN[month - 1] : MONTH_TH[month - 1];

  return (
    <Section
      title={t('ปฏิทินเช่าชุด', 'Rental calendar')}
      caption={t(
        'ชุดไหนออกไปวันไหน กันไม่ให้จองซ้อนกัน ระบบเช็กให้อัตโนมัติตอนยืนยันการจอง',
        'What is out on which dates — the actual double-booking check runs automatically when a booking is confirmed; this is the human-readable view of it.'
      )}
      action={
        <a
          href="/dashboard/orders"
          className="text-[13px] font-semibold"
          style={{ color: C.accent }}
        >
          {t('ดูเป็นรายการ', 'List view')}
        </a>
      }
    >
      <Card pad={false}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.line}` }}>
          <a
            href={`/dashboard/orders/calendar?month=${prev.year}-${pad2(prev.month)}`}
            className="px-2 py-1 text-lg font-semibold active:opacity-60"
            style={{ color: C.ink2 }}
            aria-label={t('เดือนก่อนหน้า', 'Previous month')}
          >
            ‹
          </a>
          <p className="text-[15px] font-bold">
            {monthName} {year}
          </p>
          <a
            href={`/dashboard/orders/calendar?month=${next.year}-${pad2(next.month)}`}
            className="px-2 py-1 text-lg font-semibold active:opacity-60"
            style={{ color: C.ink2 }}
            aria-label={t('เดือนถัดไป', 'Next month')}
          >
            ›
          </a>
        </div>

        <div className="grid grid-cols-7 gap-px px-1.5 pt-2" style={{ background: C.line }}>
          {weekday.map(w => (
            <div key={w} className="pb-1.5 text-center text-[11px] font-bold" style={{ color: C.ink3, background: C.surface }}>
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px px-1.5 pb-2" style={{ background: C.line }}>
          {cells.map((day, i) => {
            if (!day) return <div key={i} style={{ background: C.ground, minHeight: 64 }} />;
            const entries = byDay.get(day) ?? [];
            const isToday = day === todayKey;
            const dayNum = Number(day.slice(-2));

            return (
              <div
                key={i}
                className="flex flex-col gap-0.5 p-1"
                style={{ background: C.surface, minHeight: 64 }}
              >
                <span
                  className="self-start px-1 text-[11px] font-bold tabular-nums"
                  style={
                    isToday
                      ? { background: C.accent, color: '#fff', borderRadius: R.pill, minWidth: 16, textAlign: 'center' }
                      : { color: C.ink3 }
                  }
                >
                  {dayNum}
                </span>
                {entries.slice(0, 2).map((e, j) => (
                  <div
                    key={j}
                    className="truncate px-1 py-0.5 text-[9.5px] font-semibold leading-tight"
                    style={{ background: C.accentSoft, color: C.accent, borderRadius: 4 }}
                    title={`${e.title} — ${e.who} (${e.orderNo})`}
                  >
                    {e.title}
                  </div>
                ))}
                {entries.length > 2 && (
                  <span className="px-1 text-[9.5px] font-semibold" style={{ color: C.ink3 }}>
                    +{entries.length - 2}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {bookings.length === 0 && (
        <Empty
          title={t('เดือนนี้ยังไม่มีการจอง', 'No bookings this month')}
          hint={t(
            'พอลูกค้ายืนยันจองในแชท และมัดจำครบแล้ว จะขึ้นในปฏิทินนี้เอง',
            'Once a customer confirms a booking in chat, it appears here automatically.'
          )}
        />
      )}
    </Section>
  );
}

function addDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}
