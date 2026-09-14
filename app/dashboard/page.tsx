// app/dashboard/page.tsx
//
// The daily brief. The shop owner's first screen.
//
// ─────────────────────────────────────────────────────────────
// WHY THINGS ARE IN THIS ORDER
//
// What to do comes FIRST, above every number.
//
// The obvious layout is counts at the top and problems underneath,
// because counts are what a dashboard usually leads with. But an
// owner opening this at the end of a day does not need to be told
// they had 23 conversations — they were there. They need to be told
// that two orders have been sitting unpaid since Tuesday and that
// four people asked for a colour the shop doesn't stock.
//
// A tidy archive of messages gets called "nice" and opened twice. A
// list of things that cost money today is why someone keeps paying.
// So: actions, then the headline figure, then the detail.
//
// Every number on this page is counted by Postgres. The Thai summary
// is the only part a model writes, and it is handed the figures and
// forbidden from doing arithmetic — same rule as order totals.
// ─────────────────────────────────────────────────────────────

import {
  getOrCreateDigest,
  getActions,
  intentLabel,
  shopDay,
  previousDay,
  nextDay,
  type Action,
} from '../../lib/digest';
import { C } from './tokens';

export const dynamic = 'force-dynamic';

const THAI_DATE = new Intl.DateTimeFormat('th-TH', {
  timeZone: process.env.SHOP_TIMEZONE ?? 'Asia/Bangkok',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function formatDay(day: string): string {
  // Midday avoids any chance of the label landing on the wrong date.
  return THAI_DATE.format(new Date(`${day}T12:00:00Z`));
}

export default async function DashboardHome({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const params = await searchParams;
  const today = shopDay();

  // Only accept a real date shape, so ?day= cannot be used to push
  // arbitrary text into a query.
  const day =
    params.day && /^\d{4}-\d{2}-\d{2}$/.test(params.day) ? params.day : today;
  const isToday = day === today;

  const [{ stats, summary }, actions] = await Promise.all([
    getOrCreateDigest(day),
    // Actions are current state, not the selected day's — an order
    // unpaid since Tuesday is today's problem, not Tuesday's. Shown
    // only on today's view, so browsing history stays a record rather
    // than a to-do list about the past.
    isToday ? getActions() : Promise.resolve<Action[]>([]),
  ]);

  return (
    <div className="space-y-12">
      {/* ── Date, and moving between days ─────────────────── */}
      <header>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h1 className="text-2xl font-semibold leading-tight lg:text-3xl">
            {isToday ? 'วันนี้' : formatDay(day)}
          </h1>
          <div className="flex items-center gap-4 text-sm">
            <a
              href={`/dashboard?day=${previousDay(day)}`}
              className="underline underline-offset-4"
              style={{ color: C.pen }}
            >
              ← วันก่อน
            </a>
            {!isToday && (
              <>
                <a
                  href={`/dashboard?day=${nextDay(day)}`}
                  className="underline underline-offset-4"
                  style={{ color: C.pen }}
                >
                  วันถัดไป →
                </a>
                <a
                  href="/dashboard"
                  className="underline underline-offset-4"
                  style={{ color: C.pen }}
                >
                  กลับมาวันนี้
                </a>
              </>
            )}
          </div>
        </div>
        {isToday && (
          <p className="mt-2 text-sm" style={{ color: C.muted }}>
            {formatDay(day)} · ตัวเลขอัปเดตสดตลอดวัน
          </p>
        )}
      </header>

      {/* ── The written summary, for finished days only ────── */}
      {summary && (
        <section
          className="rounded-lg border p-5 text-base leading-relaxed"
          style={{ borderColor: C.rule, background: C.surface }}
        >
          {summary.split('\n').filter(Boolean).map((line, i) => (
            <p key={i} className={i > 0 ? 'mt-2' : undefined}>
              {line}
            </p>
          ))}
        </section>
      )}

      {/* ── What to do. Above the numbers, on purpose. ─────── */}
      {isToday && <Actions actions={actions} />}

      {/* ── The headline figure and the counts ─────────────── */}
      <section>
        <div
          className="rounded-lg border p-6"
          style={{ borderColor: C.rule, background: C.surface }}
        >
          <p className="text-sm" style={{ color: C.muted }}>
            ยอดขาย{isToday ? 'วันนี้' : 'วันนั้น'}
          </p>
          {/* Hero figure: proportional figures, not tabular — at this
              size tabular-nums makes a number look loose. */}
          <p className="mt-1 text-5xl font-semibold leading-none">
            {stats.revenue.toLocaleString('th-TH')}
            <span className="ml-2 text-xl font-normal" style={{ color: C.muted }}>
              บาท
            </span>
          </p>
          <p className="mt-2 text-sm" style={{ color: C.muted }}>
            จาก {stats.orders} ออเดอร์
          </p>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="แชททั้งหมด" value={stats.conversations} />
          <Tile label="ลูกค้าใหม่" value={stats.newCustomers} />
          <Tile label="ข้อความ" value={stats.messages} />
          <Tile
            label="ส่งต่อให้คุณ"
            value={stats.handovers}
            note={stats.handovers > 0 ? 'ผู้ช่วยหยุดตอบในแชทเหล่านี้' : undefined}
          />
        </div>
      </section>

      {/* ── What customers wanted and could not have ───────── */}
      <Wanted wanted={stats.wanted} />

      {/* ── What they asked about ──────────────────────────── */}
      <Topics topics={stats.topics} total={stats.messages} />

      {/* ── Why threads went to a human ────────────────────── */}
      {stats.handoverReasons.length > 0 && (
        <section>
          <h2 className="text-lg font-medium">เหตุผลที่ส่งต่อให้คุณ</h2>
          <p className="mt-1 text-sm" style={{ color: C.muted }}>
            ผู้ช่วยบันทึกไว้เองตอนที่หยุดตอบ
          </p>
          <ul className="mt-4 space-y-2">
            {stats.handoverReasons.map((r, i) => (
              <li
                key={i}
                className="rounded border px-4 py-2.5 text-sm"
                style={{ borderColor: C.rule, background: C.surface }}
              >
                {r}
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats.messages === 0 && (
        <p className="text-sm" style={{ color: C.muted }}>
          {isToday
            ? 'ยังไม่มีข้อความเข้ามาวันนี้ค่ะ'
            : 'ไม่มีข้อความในวันนี้ค่ะ'}
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Actions
   ───────────────────────────────────────────────────────────── */

function Actions({ actions }: { actions: Action[] }) {
  if (actions.length === 0) {
    return (
      <section
        className="rounded-lg border px-5 py-4 text-sm"
        style={{ borderColor: C.rule, background: C.surface, color: C.good }}
      >
        ✓ ไม่มีอะไรค้างอยู่ค่ะ
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-lg font-medium">ที่ต้องทำ</h2>
      <ul className="mt-4 space-y-3">
        {actions.map(a => {
          const serious = a.severity === 'serious';
          const color = serious ? C.stamp : C.pen;
          return (
            <li
              key={a.kind}
              className="rounded-lg border-l-4 border-y border-r px-5 py-4"
              style={{
                borderLeftColor: color,
                borderTopColor: C.rule,
                borderRightColor: C.rule,
                borderBottomColor: C.rule,
                background: C.surface,
              }}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {/* A glyph and a word, not just a colour: the red and
                    green in this palette are too close under
                    deuteranopia to carry meaning on their own. */}
                <span aria-hidden="true" style={{ color }}>
                  {serious ? '●' : '○'}
                </span>
                <span className="text-base font-medium">{a.label}</span>
                <span
                  className="text-sm tabular-nums"
                  style={{ color }}
                >
                  {a.count} รายการ
                </span>
                <span className="sr-only">
                  {serious ? 'ต้องทำก่อน' : 'ควรทำ'}
                </span>
              </div>
              {a.detail && (
                <p className="mt-1.5 text-sm leading-relaxed" style={{ color: C.muted }}>
                  {a.detail}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Stat tile
   ───────────────────────────────────────────────────────────── */

function Tile({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note?: string;
}) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: C.rule, background: C.surface }}
    >
      <p className="text-sm" style={{ color: C.muted }}>
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold leading-none">
        {value.toLocaleString('th-TH')}
      </p>
      {note && (
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: C.muted }}>
          {note}
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   What customers wanted and could not have

   The most valuable block on the page, and it costs nothing to
   produce: analyze() already worked it out on every message in order
   to refuse the order.
   ───────────────────────────────────────────────────────────── */

const WANTED_TH: Record<string, string> = {
  'ไซส์ไม่ถูกต้อง': 'ขอไซส์ที่ไม่มี',
  'สีไม่ถูกต้อง': 'ขอสีที่ไม่มี',
  'สินค้าหมด': 'ขอสินค้าที่หมดแล้ว',
  'จำนวน': 'ยังไม่บอกจำนวน',
};

function Wanted({ wanted }: { wanted: Record<string, number> }) {
  const rows = Object.entries(wanted).sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-medium">ลูกค้าอยากได้ แต่ร้านไม่มี</h2>
      <p className="mt-1 text-sm leading-relaxed" style={{ color: C.muted }}>
        ผู้ช่วยไม่รับออเดอร์พวกนี้ให้ ถ้าตัวเลขไหนสูงบ่อยๆ
        อาจคุ้มที่จะสั่งเข้ามาเพิ่ม
      </p>
      <ul className="mt-4 space-y-2">
        {rows.map(([key, n]) => (
          <li
            key={key}
            className="flex items-baseline justify-between rounded border px-4 py-2.5"
            style={{ borderColor: C.rule, background: C.surface }}
          >
            <span className="text-sm">{WANTED_TH[key] ?? key}</span>
            <span className="text-sm font-medium tabular-nums">{n} ครั้ง</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Topic breakdown

   A ranked bar list: one measure across categories, so ONE hue —
   length carries the magnitude and the label carries the identity.
   Colouring each topic differently would imply the colours mean
   something, and with seven topics it would also fail every
   colourblind check.

   No legend (single series), no gridlines, and every value is
   directly labelled at the bar tip — with this few rows there is
   nothing a tooltip would add that the label doesn't already say.
   ───────────────────────────────────────────────────────────── */

function Topics({
  topics,
  total,
}: {
  topics: Record<string, number>;
  total: number;
}) {
  const rows = Object.entries(topics).sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) return null;

  const max = Math.max(...rows.map(([, n]) => n));

  return (
    <section>
      <h2 className="text-lg font-medium">ลูกค้าถามเรื่องอะไร</h2>
      <p className="mt-1 text-sm" style={{ color: C.muted }}>
        นับจากข้อความที่ลูกค้าส่งมา
      </p>

      <div className="mt-4 space-y-3">
        {rows.map(([intent, n]) => (
          <div key={intent}>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-sm">{intentLabel(intent)}</span>
              <span className="text-sm font-medium tabular-nums">{n}</span>
            </div>
            {/* Track one step off the surface; bar 10px with a 4px
                rounded data-end and a square start at the baseline. */}
            <div
              className="mt-1.5 h-2.5 w-full overflow-hidden rounded-sm"
              style={{ background: C.track }}
              role="img"
              aria-label={`${intentLabel(intent)} ${n} ข้อความ`}
            >
              <div
                className="h-full"
                style={{
                  width: `${Math.max((n / max) * 100, 2)}%`,
                  background: C.pen,
                  borderRadius: '0 4px 4px 0',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {total > 0 && (
        <p className="mt-3 text-xs" style={{ color: C.muted }}>
          จากข้อความทั้งหมด {total.toLocaleString('th-TH')} ข้อความ
          (รวมข้อความที่ผู้ช่วยตอบ)
        </p>
      )}
    </section>
  );
}
