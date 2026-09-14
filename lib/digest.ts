// lib/digest.ts
//
// The daily brief.
//
// ─────────────────────────────────────────────────────────────
// WHAT THIS IS FOR
//
// A shop owner will not read forty DM threads at the end of a day.
// The point of this is not to make reading them prettier — it is to
// make reading them unnecessary, and to surface the handful of things
// that cost or earn money:
//
//   orders sitting unpaid       -> go chase them
//   colours and sizes wanted    -> restock, or stop advertising them
//   questions the bot dodged    -> fill in one field and it stops
//   threads waiting on a human  -> you are the blocker
//
// NUMBERS COME FROM SQL. PROSE COMES FROM THE MODEL.
//
// Same rule as order totals. Every figure on the page is counted by
// Postgres. The model is handed those figures and asked only to write
// two sentences of Thai around them — it never produces a number the
// owner reads, because a model that miscounts a day's orders is worse
// than no summary at all.
// ─────────────────────────────────────────────────────────────

import { and, eq, gte, lt, isNotNull, desc, sql } from 'drizzle-orm';
import { db, getShopId } from './db';
import {
  conversations,
  messages,
  orders,
  products,
  digests,
  type DigestStats,
  type Digest,
} from './db/schema';
import { shopDay, SHOP_TIMEZONE } from './conversations';

export type { DigestStats, Digest };
export { shopDay };

const API_URL = 'https://api.opentyphoon.ai/v1/chat/completions';
const MODEL = process.env.TYPHOON_MODEL ?? 'typhoon-v2.5-30b-a3b-instruct';

/* ─────────────────────────────────────────────────────────────
   Day boundaries

   A 'YYYY-MM-DD' in the shop's timezone has to become two UTC
   instants to filter on. Bangkok has no daylight saving, so a fixed
   +07:00 would work today — but deriving the real offset means a shop
   in a DST timezone does not silently get seven hours of the wrong
   day, which is the kind of bug nobody finds for months.
   ───────────────────────────────────────────────────────────── */

function offsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
    .formatToParts(at)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );

  return (asIfUtc - at.getTime()) / 60000;
}

/** The UTC window covering one local day. */
export function dayRange(day: string): { from: Date; to: Date } {
  const [y, m, d] = day.split('-').map(Number);

  // Probe at local-ish midday, safely away from any DST transition,
  // to learn the offset in force on that date.
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const off = offsetMinutes(SHOP_TIMEZONE, probe);

  const from = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - off * 60000);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from, to };
}

export function previousDay(day: string): string {
  const { from } = dayRange(day);
  return shopDay(new Date(from.getTime() - 12 * 60 * 60 * 1000));
}

export function nextDay(day: string): string {
  const { to } = dayRange(day);
  return shopDay(new Date(to.getTime() + 12 * 60 * 60 * 1000));
}

/* ─────────────────────────────────────────────────────────────
   Counting a day — all SQL
   ───────────────────────────────────────────────────────────── */

const EMPTY: DigestStats = {
  conversations: 0,
  newCustomers: 0,
  messages: 0,
  orders: 0,
  revenue: 0,
  handovers: 0,
  topics: {},
  handoverReasons: [],
  wanted: {},
};

export async function getStatsForDay(day: string): Promise<DigestStats> {
  try {
    const shopId = await getShopId();
    const { from, to } = dayRange(day);

    // messages carries no shop_id — it hangs off conversations — so
    // every query here joins through to scope it to this shop.
    const inDay = and(
      eq(conversations.shopId, shopId),
      gte(messages.createdAt, from),
      lt(messages.createdAt, to)
    );

    const [
      msgRow,
      convoRow,
      newRow,
      orderRow,
      topicRows,
      tier3Rows,
      wantedRows,
    ] = await Promise.all([
      // Total messages, both directions.
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(inDay),

      // Threads that saw any activity.
      db
        .select({ n: sql<number>`count(distinct ${messages.conversationId})::int` })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(inDay),

      // People who wrote in for the first time.
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(conversations)
        .where(
          and(
            eq(conversations.shopId, shopId),
            gte(conversations.createdAt, from),
            lt(conversations.createdAt, to)
          )
        ),

      db
        .select({
          n: sql<number>`count(*)::int`,
          revenue: sql<number>`coalesce(sum(${orders.total}), 0)::int`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.shopId, shopId),
            gte(orders.createdAt, from),
            lt(orders.createdAt, to)
          )
        ),

      // The topic breakdown, free: analyze() already classified every
      // inbound message, so this is a GROUP BY over work already done.
      db
        .select({ intent: messages.intent, n: sql<number>`count(*)::int` })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(and(inDay, eq(messages.role, 'customer'), isNotNull(messages.intent)))
        .groupBy(messages.intent),

      // Why threads went to a human, in the model's own words.
      db
        .select({
          conversationId: messages.conversationId,
          tierReason: messages.tierReason,
          intent: messages.intent,
        })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(and(inDay, eq(messages.tier, 3))),

      // The restock signal. Aggregated in JS rather than with unnest:
      // one day of messages is a small list, and a readable query
      // beats a clever one here.
      db
        .select({ missing: messages.missing })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(and(inDay, eq(messages.role, 'customer'))),
    ]);

    const topics: Record<string, number> = {};
    for (const r of topicRows) if (r.intent) topics[r.intent] = r.n;

    const wanted: Record<string, number> = {};
    for (const r of wantedRows) {
      for (const w of r.missing ?? []) {
        if (!w) continue;
        wanted[w] = (wanted[w] ?? 0) + 1;
      }
    }

    // One entry per thread, not per message: a customer asking about
    // payment three times is one handover, not three.
    const seen = new Set<number>();
    const handoverReasons: string[] = [];
    for (const r of tier3Rows) {
      if (seen.has(r.conversationId)) continue;
      seen.add(r.conversationId);
      const reason = r.tierReason || r.intent || '';
      if (reason) handoverReasons.push(reason);
    }

    return {
      conversations: convoRow[0]?.n ?? 0,
      newCustomers: newRow[0]?.n ?? 0,
      messages: msgRow[0]?.n ?? 0,
      orders: orderRow[0]?.n ?? 0,
      revenue: orderRow[0]?.revenue ?? 0,
      handovers: seen.size,
      topics,
      handoverReasons,
      wanted,
    };
  } catch (err) {
    // A broken digest must not take the page down. Zeroes with a
    // logged error beat a 500 on the shop's home screen.
    console.error('[DIGEST] stats failed:', err);
    return EMPTY;
  }
}

/* ─────────────────────────────────────────────────────────────
   Things to actually do

   Not day-scoped — this is current state. An order unpaid since
   Tuesday is today's problem, not Tuesday's.
   ───────────────────────────────────────────────────────────── */

export type Action = {
  kind: 'unpaid' | 'no_price' | 'waiting' | 'uncovered' | 'unsynced';
  severity: 'warning' | 'serious';
  /** Thai, shown to the shop owner. */
  label: string;
  count: number;
  detail?: string;
  href?: string;
};

const UNPAID_AFTER_DAYS = 2;
const UNCOVERED_WINDOW_DAYS = 7;

export async function getActions(): Promise<Action[]> {
  const out: Action[] = [];

  try {
    const shopId = await getShopId();
    const now = Date.now();

    const unpaidCutoff = new Date(now - UNPAID_AFTER_DAYS * 864e5);
    const uncoveredCutoff = new Date(now - UNCOVERED_WINDOW_DAYS * 864e5);

    const [stale, unpriced, waiting, uncovered] = await Promise.all([
      db
        .select({ orderNo: orders.orderNo, total: orders.total })
        .from(orders)
        .where(
          and(
            eq(orders.shopId, shopId),
            eq(orders.status, 'pending_payment'),
            lt(orders.createdAt, unpaidCutoff)
          )
        )
        .orderBy(desc(orders.createdAt))
        .limit(20),

      db
        .select({ title: products.title })
        .from(products)
        .where(and(eq(products.shopId, shopId), sql`${products.price} is null`))
        .limit(20),

      db
        .select({ customerId: conversations.customerId, reason: conversations.handoverReason })
        .from(conversations)
        .where(and(eq(conversations.shopId, shopId), eq(conversations.handedOver, true)))
        .orderBy(desc(conversations.lastMessageAt))
        .limit(20),

      // Tier 2 — the catalog could not answer it. Each one is a
      // question the bot will keep failing until a `details` field
      // gets filled in, so this list is a to-do, not a report.
      db
        .select({ tierReason: messages.tierReason })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(
          and(
            eq(conversations.shopId, shopId),
            eq(messages.tier, 2),
            gte(messages.createdAt, uncoveredCutoff)
          )
        )
        .limit(20),
    ]);

    if (stale.length > 0) {
      out.push({
        kind: 'unpaid',
        severity: 'serious',
        label: `ออเดอร์รอชำระเงินเกิน ${UNPAID_AFTER_DAYS} วัน`,
        count: stale.length,
        detail: stale.slice(0, 4).map(o => `${o.orderNo} (${o.total} บาท)`).join(' · '),
      });
    }

    if (waiting.length > 0) {
      out.push({
        kind: 'waiting',
        severity: 'serious',
        label: 'แชทที่รอคุณตอบ ผู้ช่วยหยุดตอบไว้แล้ว',
        count: waiting.length,
        detail: waiting
          .slice(0, 4)
          .map(w => w.reason || '—')
          .join(' · '),
      });
    }

    if (unpriced.length > 0) {
      out.push({
        kind: 'no_price',
        severity: 'warning',
        label: 'สินค้าที่ยังไม่มีราคา ผู้ช่วยจะไม่รับออเดอร์ให้',
        count: unpriced.length,
        detail: unpriced.slice(0, 4).map(p => p.title || '—').join(' · '),
      });
    }

    if (uncovered.length > 0) {
      const reasons = Array.from(
        new Set(uncovered.map(u => u.tierReason).filter(Boolean))
      );
      out.push({
        kind: 'uncovered',
        severity: 'warning',
        label: `คำถามที่ผู้ช่วยตอบไม่ได้ (${UNCOVERED_WINDOW_DAYS} วันที่ผ่านมา)`,
        count: uncovered.length,
        detail: reasons.slice(0, 4).join(' · '),
      });
    }
  } catch (err) {
    console.error('[DIGEST] actions failed:', err);
  }

  return out;
}

/* ─────────────────────────────────────────────────────────────
   The written summary

   Generated once per day, on the first view of that day, and stored.
   Today never gets one: the page shows live numbers instead, because
   a sentence written at 2pm is wrong by 6pm and paying for a fresh
   one on every page load is waste.
   ───────────────────────────────────────────────────────────── */

const INTENT_TH: Record<string, string> = {
  question: 'ถามข้อมูลสินค้า',
  confirm_order: 'ยืนยันสั่งซื้อ',
  payment: 'เรื่องการชำระเงิน',
  human_request: 'ขอคุยกับแอดมิน',
  complaint: 'ร้องเรียน',
  uncovered: 'เรื่องที่ข้อมูลไม่ครอบคลุม',
  other: 'ทักทาย/อื่นๆ',
};

export function intentLabel(intent: string): string {
  return INTENT_TH[intent] ?? intent;
}

/**
 * Two or three lines of Thai about the day.
 *
 * The prompt hands over the counted figures and forbids arithmetic.
 * The model's only job is to say which of them matters, in the voice
 * of a shop assistant reporting to an owner.
 */
async function writeSummary(day: string, stats: DigestStats): Promise<string> {
  if (stats.messages === 0) return 'วันนี้ไม่มีข้อความเข้ามาค่ะ';

  const facts = [
    `วันที่: ${day}`,
    `จำนวนแชท: ${stats.conversations}`,
    `ลูกค้าใหม่: ${stats.newCustomers}`,
    `ข้อความทั้งหมด: ${stats.messages}`,
    `ออเดอร์: ${stats.orders}`,
    `ยอดขายรวม: ${stats.revenue} บาท`,
    `ส่งต่อให้แอดมิน: ${stats.handovers}`,
    `หัวข้อที่ลูกค้าถาม: ${
      Object.entries(stats.topics)
        .map(([k, v]) => `${intentLabel(k)} ${v}`)
        .join(', ') || 'ไม่มี'
    }`,
    `สิ่งที่ลูกค้าต้องการแต่ไม่มี: ${
      Object.entries(stats.wanted)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ') || 'ไม่มี'
    }`,
    `เหตุผลที่ส่งต่อ: ${stats.handoverReasons.join(', ') || 'ไม่มี'}`,
  ].join('\n');

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.TYPHOON_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content:
`คุณเป็นผู้ช่วยร้านค้าออนไลน์ สรุปให้เจ้าของร้านอ่านตอนสิ้นวัน

กติกา:
- เขียนภาษาไทย 2-3 บรรทัด สั้นๆ ใช้ ค่ะ/นะคะ
- ใช้ตัวเลขจากข้อมูลที่ให้มาเท่านั้น ห้ามคำนวณเอง ห้ามเดา
- บอกเฉพาะเรื่องที่เจ้าของร้านควรทำต่อ ไม่ต้องอ่านตัวเลขซ้ำทุกตัว
- ถ้ามีสิ่งที่ลูกค้าต้องการแต่ร้านไม่มี ให้พูดถึงก่อนเรื่องอื่น
- ห้ามใช้ markdown ห้ามใช้หัวข้อ เขียนเป็นประโยคธรรมดา`,
          },
          { role: 'user', content: facts },
        ],
        max_tokens: 300,
      }),
    });

    if (!res.ok) throw new Error(`Typhoon ${res.status}`);

    const data = await res.json();
    const text = String(data.choices?.[0]?.message?.content ?? '').trim();
    return text || 'สรุปไม่สำเร็จค่ะ ดูตัวเลขด้านล่างได้เลยนะคะ';
  } catch (err) {
    // The numbers below it are still correct and still useful, so the
    // page renders without the prose rather than failing.
    console.error('[DIGEST] summary failed:', err);
    return '';
  }
}

/**
 * A completed day's digest, written once and reused.
 *
 * Today is deliberately not stored — call getStatsForDay() for a live
 * view instead.
 */
export async function getOrCreateDigest(day: string): Promise<{
  stats: DigestStats;
  summary: string;
}> {
  const stats = await getStatsForDay(day);

  // Today is live; no saved summary.
  if (day === shopDay()) return { stats, summary: '' };

  try {
    const shopId = await getShopId();

    const [existing] = await db
      .select()
      .from(digests)
      .where(and(eq(digests.shopId, shopId), eq(digests.day, day)))
      .limit(1);

    if (existing) {
      return { stats: existing.stats ?? stats, summary: existing.summary };
    }

    const summary = await writeSummary(day, stats);

    // onConflictDoNothing: two people opening the page at the same
    // moment must not both pay for a summary and race to store it.
    await db
      .insert(digests)
      .values({ shopId, day, summary, stats })
      .onConflictDoNothing();

    return { stats, summary };
  } catch (err) {
    console.error('[DIGEST] getOrCreateDigest failed:', err);
    return { stats, summary: '' };
  }
}
