// app/dashboard/page.tsx — วันนี้
//
// The daily brief, rebuilt as "แผงร้าน".
//
// Order on the screen, and why:
//
//   1. one headline number      — the day in one glance
//   2. what to do               — the reason to open this at all
//   3. supporting counts        — context, not the point
//   4. what customers wanted    — the restock signal
//   5. what they asked about    — the shape of the day
//
// Actions above counts. An owner opening this at 7pm does not need
// telling they had 23 conversations; they were there. They need
// telling that two orders have been unpaid since Tuesday.
//
// Every figure is counted by Postgres. The Thai summary on past days
// is the only model-written part, and it is handed the figures and
// forbidden from doing arithmetic — same rule as order totals.

import {
  getOrCreateDigest,
  getActions,
  intentLabel,
  shopDay,
  previousDay,
  nextDay,
  type Action,
} from '../../lib/digest';
import {
  Card,
  Section,
  Hero,
  Tile,
  Row,
  RowList,
  Bar,
  Pill,
  AllClear,
  Empty,
} from '../../components/ui';
import { C } from './theme';

export const dynamic = 'force-dynamic';

const THAI_DATE = new Intl.DateTimeFormat('th-TH', {
  timeZone: process.env.SHOP_TIMEZONE ?? 'Asia/Bangkok',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const WANTED_TH: Record<string, string> = {
  'ไซส์ไม่ถูกต้อง': 'ขอไซส์ที่ไม่มี',
  'สีไม่ถูกต้อง': 'ขอสีที่ไม่มี',
  'สินค้าหมด': 'ขอสินค้าที่หมดแล้ว',
  'จำนวน': 'ยังไม่บอกจำนวน',
};

export default async function Today({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const params = await searchParams;
  const today = shopDay();

  // Only a real date shape, so ?day= cannot push arbitrary text into
  // a query.
  const day =
    params.day && /^\d{4}-\d{2}-\d{2}$/.test(params.day) ? params.day : today;
  const isToday = day === today;

  const [{ stats, summary }, actions] = await Promise.all([
    getOrCreateDigest(day),
    // Actions are current state, not the chosen day's. An order unpaid
    // since Tuesday is today's problem. Showing them on a past day
    // would turn a record into a to-do list about history.
    isToday ? getActions() : Promise.resolve<Action[]>([]),
  ]);

  const wanted = Object.entries(stats.wanted).sort((a, b) => b[1] - a[1]);
  const topics = Object.entries(stats.topics).sort((a, b) => b[1] - a[1]);
  const topMax = topics.length > 0 ? topics[0][1] : 1;

  return (
    <>
      {/* ── Day switch ──────────────────────────────────────── */}
      {!isToday && (
        <Card tone="accent" pad={false}>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-[13.5px] font-semibold" style={{ color: C.accent }}>
              {THAI_DATE.format(new Date(`${day}T12:00:00Z`))}
            </span>
            <a
              href="/dashboard"
              className="text-[13px] font-semibold underline underline-offset-4"
              style={{ color: C.accent }}
            >
              กลับมาวันนี้
            </a>
          </div>
        </Card>
      )}

      {/* ── The written summary, finished days only ─────────── */}
      {summary && (
        <Card>
          {summary
            .split('\n')
            .filter(Boolean)
            .map((line, i) => (
              <p
                key={i}
                className={`text-[14.5px] leading-relaxed ${i > 0 ? 'mt-2' : ''}`}
              >
                {line}
              </p>
            ))}
        </Card>
      )}

      {/* ── 1. The headline ─────────────────────────────────── */}
      <Card>
        <Hero
          label={isToday ? 'ยอดขายวันนี้' : 'ยอดขายวันนั้น'}
          value={stats.revenue}
          unit="บาท"
          sub={`จาก ${stats.orders} ออเดอร์ · ${stats.conversations} แชท`}
        />
      </Card>

      {/* ── 2. What to do ───────────────────────────────────── */}
      {isToday && (
        <Section title="ที่ต้องทำ">
          {actions.length === 0 ? (
            <AllClear>ไม่มีอะไรค้างอยู่ค่ะ</AllClear>
          ) : (
            <RowList>
              {actions.map((a, i) => (
                <Row
                  key={a.kind}
                  first={i === 0}
                  severity={a.severity === 'serious' ? 'urgent' : 'warn'}
                  title={a.label}
                  detail={a.detail}
                  right={
                    <Pill tone={a.severity === 'serious' ? 'urgent' : 'warn'}>
                      {a.count}
                    </Pill>
                  }
                  href={hrefFor(a)}
                />
              ))}
            </RowList>
          )}
        </Section>
      )}

      {/* ── 3. Supporting counts ────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <Tile label="ลูกค้าใหม่" value={stats.newCustomers} />
        <Tile label="ข้อความ" value={stats.messages} />
        <Tile
          label="ส่งต่อให้คุณ"
          value={stats.handovers}
          note={stats.handovers > 0 ? 'ผู้ช่วยหยุดตอบในแชทเหล่านี้' : undefined}
        />
        <Tile label="ออเดอร์" value={stats.orders} />
      </div>

      {/* ── 4. The restock signal ───────────────────────────── */}
      {wanted.length > 0 && (
        <Section
          title="ลูกค้าอยากได้ แต่ร้านไม่มี"
          caption="ผู้ช่วยไม่รับออเดอร์พวกนี้ให้ ถ้าตัวเลขไหนสูงบ่อยๆ อาจคุ้มที่จะสั่งเข้ามาเพิ่ม"
        >
          <RowList>
            {wanted.map(([key, n], i) => (
              <Row
                key={key}
                first={i === 0}
                title={WANTED_TH[key] ?? key}
                right={<span className="text-[13.5px] font-semibold tabular-nums">{n} ครั้ง</span>}
              />
            ))}
          </RowList>
        </Section>
      )}

      {/* ── 5. The shape of the day ─────────────────────────── */}
      {topics.length > 0 && (
        <Section title="ลูกค้าถามเรื่องอะไร" caption="นับจากข้อความที่ลูกค้าส่งมา">
          <Card>
            <div className="flex flex-col gap-3.5">
              {topics.map(([intent, n]) => (
                <Bar key={intent} label={intentLabel(intent)} value={n} max={topMax} />
              ))}
            </div>
          </Card>
        </Section>
      )}

      {/* ── Why threads went to a human ─────────────────────── */}
      {stats.handoverReasons.length > 0 && (
        <Section
          title="เหตุผลที่ส่งต่อให้คุณ"
          caption="ผู้ช่วยบันทึกไว้เองตอนที่หยุดตอบ"
        >
          <RowList>
            {stats.handoverReasons.map((r, i) => (
              <Row key={i} first={i === 0} title={r} />
            ))}
          </RowList>
        </Section>
      )}

      {stats.messages === 0 && (
        <Empty
          title={isToday ? 'ยังไม่มีข้อความเข้ามาวันนี้' : 'ไม่มีข้อความในวันนั้น'}
          hint="พอลูกค้าทักเข้ามาใน Instagram ทุกอย่างจะขึ้นที่นี่เอง"
        />
      )}

      {/* ── Yesterday ───────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 pt-1">
        <a
          href={`/dashboard?day=${previousDay(day)}`}
          className="text-[13.5px] font-semibold"
          style={{ color: C.accent }}
        >
          ← วันก่อน
        </a>
        {!isToday && (
          <a
            href={`/dashboard?day=${nextDay(day)}`}
            className="text-[13.5px] font-semibold"
            style={{ color: C.accent }}
          >
            วันถัดไป →
          </a>
        )}
      </div>
    </>
  );
}

/**
 * Where an action row goes when tapped.
 *
 * The whole point of the tab bar is that everything is one reach
 * away — so an action that names a problem should land on the screen
 * where it gets fixed, not just describe it.
 */
function hrefFor(a: Action): string | undefined {
  switch (a.kind) {
    case 'unpaid':
      return '/dashboard/orders';
    case 'waiting':
    case 'uncovered':
      return '/dashboard/chats';
    case 'no_price':
      return '/dashboard/products';
    default:
      return undefined;
  }
}
