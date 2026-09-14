// lib/conversations.ts
//
// The durable record of what was said.
//
// ─────────────────────────────────────────────────────────────
// THIS IS NOT WHERE THE BOT'S STATE LIVES
//
// Redis still holds everything the bot reads while deciding what to
// do: the atomic message claim, the handover flag, the duplicate-order
// guard, the image/caption window, thread language. None of that
// moved, and none of it should — claimMessage's SET NX is the only
// reason a Meta retry cannot produce a duplicate order.
//
// This file writes a SECOND, slower copy for people to read later.
// Redis forgets after a day; this does not.
//
// EVERY FUNCTION HERE SWALLOWS ITS OWN ERRORS.
//
// That is deliberate and it is the most important line in the file.
// Logging runs alongside answering a customer. If a write to this
// table can throw, then a database hiccup stops the shop replying to
// someone who wants to buy something. A missing log line costs the
// seller a row in a report. Losing the reply costs them the sale.
// Same asymmetry as the Redis defaults elsewhere: fail toward the
// customer still getting an answer.
// ─────────────────────────────────────────────────────────────

import { eq, and, lt, desc, asc } from 'drizzle-orm';
import { db, getShopId } from './db';
import { conversations, messages, type Conversation, type Message, type MessageRole } from './db/schema';
import { claimWindow } from './redis';

export type { Conversation, Message, MessageRole };

/**
 * How long transcripts are kept.
 *
 * These are other people's private conversations held on the shop's
 * behalf, not the shop's own records. 90 days is long enough to
 * settle a dispute about an order and short enough that the store
 * does not become an indefinite archive of strangers' messages.
 */
export const MESSAGE_RETENTION_DAYS = 90;

/** Profiles are re-fetched at most this often. Names rarely change. */
const PROFILE_REFRESH_DAYS = 30;

const IG_API_VERSION = 'v23.0';

/* ─────────────────────────────────────────────────────────────
   Days, in the shop's timezone

   A Thai shop's day is not a UTC day. Midnight UTC is 7am in
   Bangkok, so grouping by UTC date would split an evening's trade
   across two reports and make every daily number wrong by a few
   hours' worth of messages.
   ───────────────────────────────────────────────────────────── */

export const SHOP_TIMEZONE = process.env.SHOP_TIMEZONE ?? 'Asia/Bangkok';

/** 'YYYY-MM-DD' for the given instant, in the shop's timezone. */
export function shopDay(at: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which saves assembling the parts by
  // hand and getting the padding wrong.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SHOP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/* ─────────────────────────────────────────────────────────────
   Getting or creating a thread
   ───────────────────────────────────────────────────────────── */

/**
 * The conversation row for this customer, created if absent.
 *
 * insert-then-select rather than select-then-insert: two webhook
 * invocations can handle two messages from the same new customer at
 * the same moment, and the unique index on (shop_id, customer_id) is
 * what actually prevents a second row. Checking first would leave a
 * gap between the check and the insert.
 *
 * Returns null on failure, and every caller treats null as "skip the
 * logging and carry on".
 */
async function ensureConversation(
  customerId: string,
  lang?: 'th' | 'en'
): Promise<Conversation | null> {
  try {
    const shopId = await getShopId();

    await db
      .insert(conversations)
      .values({ shopId, customerId, lang: lang ?? 'th' })
      .onConflictDoNothing();

    const [row] = await db
      .select()
      .from(conversations)
      .where(
        and(eq(conversations.shopId, shopId), eq(conversations.customerId, customerId))
      )
      .limit(1);

    return row ?? null;
  } catch (err) {
    console.error('[LOG] ensureConversation failed:', err);
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────
   Writing a message
   ───────────────────────────────────────────────────────────── */

export type LogInput = {
  customerId: string;
  role: MessageRole;
  text?: string;
  /** Only for customer messages — what analyze() decided. */
  intent?: string | null;
  tier?: number | null;
  tierReason?: string;
  /** analyze()'s `missing` array — what the customer wanted and could not have. */
  missing?: string[];
  imageUrl?: string;
  imageKind?: string;
  lang?: 'th' | 'en';
};

/**
 * Record one message.
 *
 * Called from the webhook after the customer has already been
 * answered, so nothing here is on the path to a reply.
 */
export async function logMessage(input: LogInput): Promise<void> {
  try {
    const convo = await ensureConversation(input.customerId, input.lang);
    if (!convo) return;

    await db.insert(messages).values({
      conversationId: convo.id,
      role: input.role,
      text: (input.text ?? '').slice(0, 8000),
      intent: input.intent ?? null,
      tier: input.tier ?? null,
      tierReason: (input.tierReason ?? '').slice(0, 120),
      missing: (input.missing ?? []).slice(0, 10),
      imageUrl: input.imageUrl ?? '',
      imageKind: input.imageKind ?? '',
    });

    // lastIntent only moves on a customer message. A bot reply is not
    // a new topic, and overwriting it with null would blank the
    // conversations list's topic column on every answer.
    const patch: Record<string, unknown> = { lastMessageAt: new Date() };
    if (input.role === 'customer' && input.intent) patch.lastIntent = input.intent;
    if (input.lang) patch.lang = input.lang;

    await db.update(conversations).set(patch).where(eq(conversations.id, convo.id));

    // Cheap moment to top up the display name: the row is already
    // loaded, and this only calls Instagram when the name is actually
    // missing or stale.
    if (needsProfile(convo)) await fetchCustomerProfile(convo);
  } catch (err) {
    console.error('[LOG] logMessage failed:', err);
  }
}

/**
 * Mirror the handover flag, with the reason.
 *
 * Redis stays the flag the bot reads. This copy exists so the
 * dashboard can show WHY a thread is quiet — "asked for bank
 * account", "frustrated tone" — which Redis does not store and which
 * is the single most useful thing on the conversations list.
 */
export async function setHandover(
  customerId: string,
  handedOver: boolean,
  reason = ''
): Promise<void> {
  try {
    const convo = await ensureConversation(customerId);
    if (!convo) return;

    await db
      .update(conversations)
      .set({
        handedOver,
        // Keep the old reason when releasing, so the history of why
        // it happened is not erased by the release.
        handoverReason: handedOver ? reason.slice(0, 120) : convo.handoverReason,
      })
      .where(eq(conversations.id, convo.id));
  } catch (err) {
    console.error('[LOG] setHandover failed:', err);
  }
}

/* ─────────────────────────────────────────────────────────────
   Who the customer is

   The User Profile API works here because a customer messaging the
   shop counts as consent — no permission beyond instagram_business_basic
   and instagram_business_manage_messages, both already in use.

   It fails permanently for anyone who has blocked the shop, so a
   failure is recorded as an attempt rather than retried forever.
   ───────────────────────────────────────────────────────────── */

function needsProfile(convo: Conversation): boolean {
  if (!convo.profileFetchedAt) return true;
  const ageDays =
    (Date.now() - convo.profileFetchedAt.getTime()) / (1000 * 60 * 60 * 24);
  return ageDays > PROFILE_REFRESH_DAYS;
}

export async function fetchCustomerProfile(convo: Conversation): Promise<void> {
  try {
    const res = await fetch(
      `https://graph.instagram.com/${IG_API_VERSION}/${convo.customerId}` +
      `?fields=name,username,profile_pic,follower_count,is_verified_user` +
      `&access_token=${process.env.IG_ACCESS_TOKEN}`,
      { cache: 'no-store', signal: AbortSignal.timeout(8000) }
    );

    if (!res.ok) {
      // Stamp the attempt anyway. Without this, a customer who has
      // blocked the shop would trigger a failed Instagram call on
      // every single message they send, forever.
      await db
        .update(conversations)
        .set({ profileFetchedAt: new Date() })
        .where(eq(conversations.id, convo.id));

      console.warn(
        `[PROFILE] ${convo.customerId} unavailable (${res.status}) — ` +
        'usually means the customer blocked the shop'
      );
      return;
    }

    const p = await res.json();

    await db
      .update(conversations)
      .set({
        customerName: typeof p.name === 'string' ? p.name.slice(0, 200) : null,
        customerUsername:
          typeof p.username === 'string' ? p.username.slice(0, 200) : null,
        customerProfilePic:
          typeof p.profile_pic === 'string' ? p.profile_pic : null,
        followerCount:
          typeof p.follower_count === 'number' ? p.follower_count : null,
        isVerified:
          typeof p.is_verified_user === 'boolean' ? p.is_verified_user : null,
        profileFetchedAt: new Date(),
      })
      .where(eq(conversations.id, convo.id));
  } catch (err) {
    console.error('[PROFILE] fetch failed:', err);
  }
}

/* ─────────────────────────────────────────────────────────────
   Retention

   Piggybacks on inbound DMs the same way product sync does, so there
   is no cron to configure and nothing to forget. claimWindow keeps it
   to one run a day across every instance.
   ───────────────────────────────────────────────────────────── */

export async function pruneIfDue(): Promise<void> {
  if (!(await claimWindow('prune-messages', 60 * 60 * 24))) return;

  try {
    const cutoff = new Date(
      Date.now() - MESSAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );

    const removed = await db
      .delete(messages)
      .where(lt(messages.createdAt, cutoff))
      .returning({ id: messages.id });

    // Threads whose messages have all aged out. The row itself holds
    // a name and a profile picture, so leaving it behind would keep
    // personal data after the conversation it belonged to is gone.
    //
    // lastMessageAt < cutoff is sufficient on its own: it means the
    // thread's NEWEST message was older than the cutoff, so the delete
    // above already removed every message it had. No subquery needed.
    const emptied = await db
      .delete(conversations)
      .where(lt(conversations.lastMessageAt, cutoff))
      .returning({ id: conversations.id });

    if (removed.length > 0 || emptied.length > 0) {
      console.log(
        `[PRUNE] removed ${removed.length} message(s) and ` +
        `${emptied.length} empty conversation(s) older than ` +
        `${MESSAGE_RETENTION_DAYS} days`
      );
    }
  } catch (err) {
    console.error('[PRUNE] failed:', err);
  }
}

/* ─────────────────────────────────────────────────────────────
   Reads for the dashboard
   ───────────────────────────────────────────────────────────── */

export async function listConversations(limit = 100): Promise<Conversation[]> {
  const shopId = await getShopId();
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.shopId, shopId))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(limit);
}

/** One thread, oldest message first, the way a chat reads. */
export async function getThread(
  customerId: string
): Promise<{ conversation: Conversation; messages: Message[] } | null> {
  const shopId = await getShopId();

  const [convo] = await db
    .select()
    .from(conversations)
    .where(
      and(eq(conversations.shopId, shopId), eq(conversations.customerId, customerId))
    )
    .limit(1);

  if (!convo) return null;

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, convo.id))
    .orderBy(asc(messages.createdAt));

  return { conversation: convo, messages: rows };
}

/** Display label for a conversation — name, then username, then id. */
export function customerLabel(c: Conversation): string {
  return c.customerName || (c.customerUsername ? `@${c.customerUsername}` : c.customerId);
}
