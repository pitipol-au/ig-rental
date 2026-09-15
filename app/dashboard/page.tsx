// app/dashboard/page.tsx — วันนี้ / Today
//
// Actions above numbers, on purpose. An owner opening this at 7pm
// does not need telling they had 23 conversations; they were there.
// They need telling that two orders have been unpaid since Tuesday.
//
// Every figure is counted by Postgres. The written summary on past
// days is the only model-written part, and it is handed the figures
// and forbidden from doing arithmetic — same rule as order totals.
//
// Internal links use next/link rather than a plain anchor: client-side
// navigation, so switching days does not reload the whole shell.

import {
  getOrCreateDigest,
  getActions,
  summaryFor,
  shopDay,
  previousDay,
  nextDay,
  type Action,
} from '../../lib/digest';
import { getLocale, tr } from '../../lib/i18n-server';
import { intentLabel, wantedLabel, actionLabel } from '../../lib/i18n';
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
import Link from 'next/link';
import { C } from './theme';

export const dynamic = 'force-dynamic';

export default async function Today({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const params = await searchParams;
  const [locale, t] = await Promise.all([getLocale(), tr()]);

  const today = shopDay();
  // Only a real date shape, so ?day= cannot push arbitrary text into
  // a query.
  const day =
    params.day && /^\d{4}-\d{2}-\d{2}$/.test(params.day) ? params.day : today;
  const isToday = day === today;

  const [{ stats, summary }, actions] = await Promise.all([
    getOrCreateDigest(day),
    // Actions are current state, not the chosen day's. An order
    // unpaid since Tuesday is today's problem; showing it on a past
    // day would turn a record into a to-do list about history.
    isToday ? getActions() : Promise.resolve<Action[]>([]),
  ]);

  const dayLabel = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'th-TH', {
    timeZone: process.env.SHOP_TIMEZONE ?? 'Asia/Bangkok',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${day}T12:00:00Z`));

  const wanted = Object.entries(stats.wanted).sort((a, b) => b[1] - a[1]);
  const topics = Object.entries(stats.topics).sort((a, b) => b[1] - a[1]);
  const topMax = topics.length > 0 ? topics[0][1] : 1;
  const text = summary ? summaryFor(summary, locale) : '';

  return (
    <>
      {!isToday && (
        <Card tone="accent" pad={false}>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-[13.5px] font-semibold" style={{ color: C.accent }}>
              {dayLabel}
            </span>
            <Link href="/dashboard" className="text-[13px] font-semibold underline underline-offset-4" style={{ color: C.accent }}>
              {t('กลับมาวันนี้', 'Back to today')}
            </Link>
          </div>
        </Card>
      )}

      {text && (
        <Card>
          {text.split('\n').filter(Boolean).map((line, i) => (
            <p key={i} className={`text-[14.5px] leading-relaxed ${i > 0 ? 'mt-2' : ''}`}>
              {line}
            </p>
          ))}
        </Card>
      )}

      {/* 1. The headline */}
      <Card>
        <Hero
          label={isToday ? t('ยอดขายวันนี้', "Today's sales") : t('ยอดขายวันนั้น', 'Sales that day')}
          value={stats.revenue}
          unit={t('บาท', 'THB')}
          sub={t(
            `จาก ${stats.orders} ออเดอร์ · ${stats.conversations} แชท`,
            `${stats.orders} orders · ${stats.conversations} chats`
          )}
        />
      </Card>

      {/* 2. What to do */}
      {isToday && (
        <Section title={t('ที่ต้องทำ', 'To do')}>
          {actions.length === 0 ? (
            <AllClear>{t('ไม่มีอะไรค้างอยู่ค่ะ', 'Nothing outstanding')}</AllClear>
          ) : (
            <RowList>
              {actions.map((a, i) => (
                <Row
                  key={a.kind}
                  first={i === 0}
                  severity={a.severity === 'serious' ? 'urgent' : 'warn'}
                  title={actionLabel(a.kind, locale)}
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

      {/* 3. Supporting counts */}
      <div className="grid grid-cols-2 gap-3">
        <Tile label={t('ลูกค้าใหม่', 'New customers')} value={stats.newCustomers} />
        <Tile label={t('ข้อความ', 'Messages')} value={stats.messages} />
        <Tile
          label={t('ส่งต่อให้คุณ', 'Handed to you')}
          value={stats.handovers}
          note={
            stats.handovers > 0
              ? t('ผู้ช่วยหยุดตอบในแชทเหล่านี้', 'The assistant stopped replying in these')
              : undefined
          }
        />
        <Tile label={t('ออเดอร์', 'Orders')} value={stats.orders} />
      </div>

      {/* 4. The restock signal */}
      {wanted.length > 0 && (
        <Section
          title={t('ลูกค้าอยากได้ แต่ร้านไม่มี', 'Wanted, but you do not stock it')}
          caption={t(
            'ผู้ช่วยไม่รับออเดอร์พวกนี้ให้ ถ้าตัวเลขไหนสูงบ่อยๆ อาจคุ้มที่จะสั่งเข้ามาเพิ่ม',
            'The assistant refuses these orders. If a number keeps climbing, it may be worth restocking.'
          )}
        >
          <RowList>
            {wanted.map(([key, n], i) => (
              <Row
                key={key}
                first={i === 0}
                title={wantedLabel(key, locale)}
                right={
                  <span className="text-[13.5px] font-semibold tabular-nums">
                    {t(`${n} ครั้ง`, `${n}×`)}
                  </span>
                }
              />
            ))}
          </RowList>
        </Section>
      )}

      {/* 5. The shape of the day */}
      {topics.length > 0 && (
        <Section
          title={t('ลูกค้าถามเรื่องอะไร', 'What they asked about')}
          caption={t('นับจากข้อความที่ลูกค้าส่งมา', 'Counted from customer messages only')}
        >
          <Card>
            <div className="flex flex-col gap-3.5">
              {topics.map(([intent, n]) => (
                <Bar key={intent} label={intentLabel(intent, locale)} value={n} max={topMax} />
              ))}
            </div>
          </Card>
        </Section>
      )}

      {/* Why threads went to a human. The reasons are the model's own
          words and always English — translating them would mean a
          model call per row, and the seller reads them as a label
          rather than as prose. */}
      {stats.handoverReasons.length > 0 && (
        <Section
          title={t('เหตุผลที่ส่งต่อให้คุณ', 'Why threads came to you')}
          caption={t(
            'ผู้ช่วยบันทึกไว้เองตอนที่หยุดตอบ',
            'Recorded by the assistant at the moment it stopped'
          )}
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
          title={
            isToday
              ? t('ยังไม่มีข้อความเข้ามาวันนี้', 'No messages yet today')
              : t('ไม่มีข้อความในวันนั้น', 'No messages that day')
          }
          hint={t(
            'พอลูกค้าทักเข้ามาใน Instagram ทุกอย่างจะขึ้นที่นี่เอง',
            'As soon as a customer messages on Instagram, everything appears here.'
          )}
        />
      )}

      <div className="flex items-center justify-between gap-4 pt-1">
        <Link href={`/dashboard?day=${previousDay(day)}`} className="text-[13.5px] font-semibold" style={{ color: C.accent }}>
          {t('← วันก่อน', '← Previous day')}
        </Link>
        {!isToday && (
          <Link href={`/dashboard?day=${nextDay(day)}`} className="text-[13.5px] font-semibold" style={{ color: C.accent }}>
            {t('วันถัดไป →', 'Next day →')}
          </Link>
        )}
      </div>
    </>
  );
}

/** An action that names a problem should land on the screen where it
 *  gets fixed, not merely describe it. */
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