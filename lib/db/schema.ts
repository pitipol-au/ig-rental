// lib/db/schema.ts
//
// The whole database in one file. This is the source of truth: you
// change a table here, run `npm run db:push`, and Postgres matches.
// Nothing is defined in the database by hand.
//
// ─────────────────────────────────────────────────────────────
// WHY THERE IS A shops TABLE WHEN THERE IS ONE SHOP
//
// Every other table points at a shop. Today exactly one row exists
// (slug 'default'). It costs nothing now and it is the difference
// between "add a row" and "rewrite every query" when a second
// merchant arrives. The Google Sheet could not express this at all.
// ─────────────────────────────────────────────────────────────

import {
  pgTable,
  serial,
  bigserial,
  integer,
  text,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

/* ─────────────────────────────────────────────────────────────
   shops — one row per merchant, plus all their settings

   Settings are real columns, not the key/value rows the Shop tab
   used. Key/value existed because restructuring a spreadsheet is
   painful; changing a column here is one command. Real columns mean
   the dashboard form and the bot cannot disagree about what a field
   is called, and shipping_cost is a number rather than a string that
   might say "40 บาท".
   ───────────────────────────────────────────────────────────── */

export const shops = pgTable('shops', {
  id: serial('id').primaryKey(),

  // Which shop this is. 'default' until there is more than one.
  slug: text('slug').notNull().unique(),

  // The Instagram account id this shop's DMs arrive from. Unused
  // today — the webhook serves one account. It is what a future
  // multi-tenant webhook routes on (entry[].id), so it is recorded
  // from now on rather than backfilled later from memory.
  igUserId: text('ig_user_id').unique(),

  shopName: text('shop_name').notNull().default(''),
  sells: text('sells').notNull().default('เสื้อผ้า'),

  // Shipping in whole baht. THE ONLY PLACE shipping is defined.
  // See the note in lib/shop.ts about the bug this fixes.
  shippingCost: integer('shipping_cost').notNull().default(40),
  shippingCarrier: text('shipping_carrier').notNull().default('Flash / Kerry'),
  shippingDays: text('shipping_days').notNull().default('1-2 วันทำการ'),
  freeShippingOver: integer('free_shipping_over'),   // null = no threshold

  paymentMethod: text('payment_method').notNull().default('PromptPay'),

  // 'polite' | 'casual' — kept as text, not a Postgres enum, because
  // altering an enum is a migration and adding a third tone should not be.
  tone: text('tone').notNull().default('polite'),

  adminName: text('admin_name').notNull().default('แอดมิน'),
  hours: text('hours').notNull().default(''),
  extraNotes: text('extra_notes').notNull().default(''),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ─────────────────────────────────────────────────────────────
   products — the catalog

   Instagram still supplies the caption and the link. This table
   supplies everything the caption states unreliably: one
   authoritative price, the real colour and size lists, stock, and
   details that must never be guessed.

   colors and sizes are Postgres ARRAYS, not comma strings. They are
   injected into the model's prompt as allow-lists, and an array
   cannot accidentally contain "ขาว, ดำ" as a single colour name —
   which is exactly the kind of slip that let the model invent
   สีชมพูมิ้นท์ by blending two products' colours.
   ───────────────────────────────────────────────────────────── */

export const products = pgTable(
  'products',
  {
    id: serial('id').primaryKey(),
    shopId: integer('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),

    igMediaId: text('ig_media_id').notNull(),

    title: text('title').notNull().default(''),

    // null means "no price set" — different from 0, which would be a
    // free order. The bot refuses to confirm an order containing a
    // product with no price.
    price: integer('price'),

    inStock: boolean('in_stock').notNull().default(true),

    colors: text('colors').array().notNull().default([]),
    sizes: text('sizes').array().notNull().default([]),

    // Never parsed from a caption. Blank means "not specified", and
    // the bot says so instead of inventing care instructions.
    details: text('details').notNull().default(''),
    notes: text('notes').notNull().default(''),

    // Cached from Instagram so the dashboard and the bot can read the
    // catalog without an Instagram call, and so the catalog survives
    // a token expiring.
    caption: text('caption').notNull().default(''),
    permalink: text('permalink').notNull().default(''),
    syncedAt: timestamp('synced_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One row per Instagram post per shop. This constraint is what
    // makes sync safe to run as often as it likes: a second attempt
    // to insert the same post is rejected by the database rather than
    // relying on the code having read the existing rows correctly
    // first. The sheet version could only compare in memory.
    uniqueIndex('products_shop_media_idx').on(t.shopId, t.igMediaId),
    index('products_shop_idx').on(t.shopId),
  ]
);

/* ─────────────────────────────────────────────────────────────
   orders

   items is jsonb holding the same shape extract.ts already
   produces: [{title, color, size, qty, price}].

   TRADE-OFF, on purpose: a separate order_items table would let you
   ask "how many size M sold in red last month". jsonb cannot answer
   that without unpacking. What jsonb gives instead is that an order
   is stored exactly as it was agreed, and nothing later — a renamed
   product, a changed price — can alter a past order's record. For a
   shop whose first need is "which orders are unpaid", that is the
   better trade. Splitting it out later is one migration.
   ───────────────────────────────────────────────────────────── */

export type OrderItemRow = {
  title: string;
  color: string;
  size: string;
  qty: number;
  price: number;
};

/** pending_payment → paid → shipped, or cancelled from any of them. */
export const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'shipped',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const orders = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),
    shopId: integer('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),

    // Human-facing reference, generated in code and shown to the
    // customer. Unique so the same number can never appear twice.
    orderNo: text('order_no').notNull().unique(),

    customerId: text('customer_id').notNull(),

    items: jsonb('items').$type<OrderItemRow[]>().notNull().default([]),

    // All three stored, not just the total. Recomputing an old order's
    // shipping from today's setting would silently rewrite history
    // the moment the seller changes their shipping fee.
    subtotal: integer('subtotal').notNull().default(0),
    shipping: integer('shipping').notNull().default(0),
    total: integer('total').notNull().default(0),

    status: text('status').$type<OrderStatus>().notNull().default('pending_payment'),

    slipUrl: text('slip_url').notNull().default(''),
    trackingNo: text('tracking_no').notNull().default(''),
    note: text('note').notNull().default(''),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('orders_shop_created_idx').on(t.shopId, t.createdAt),
    index('orders_status_idx').on(t.shopId, t.status),
    index('orders_customer_idx').on(t.shopId, t.customerId),
  ]
);

/* ─────────────────────────────────────────────────────────────
   conversations + messages — the audit trail

   NOT a replacement for Redis. Redis still holds the live state the
   bot depends on: the atomic SET NX message claim, the handover flag,
   the duplicate-order guard, the image/caption window. Those need to
   be fast, they need to expire on their own, and claimMessage in
   particular needs an atomic set-if-absent that is the only reason
   duplicate orders are impossible. Moving them to Postgres would
   mean re-deriving that guarantee from transactions, for no benefit.

   These tables are the DURABLE record: what was said, what the bot
   decided, and why a thread went to a human. Redis forgets after a
   day by design. This does not, which is what makes the
   conversations view in the dashboard possible at all — today you
   cannot see any of this outside Instagram itself.

   RETENTION: these are other people's private conversations, not
   shop data. pruneOldMessages() in lib/conversations.ts deletes
   anything older than MESSAGE_RETENTION_DAYS (90). Decided now, while
   the table is empty, because "we'll add a retention policy later"
   means never — and Meta asks about exactly this at App Review.
   ───────────────────────────────────────────────────────────── */

export const conversations = pgTable(
  'conversations',
  {
    id: serial('id').primaryKey(),
    shopId: integer('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),

    // Instagram-scoped sender id. Arrives with every message.
    customerId: text('customer_id').notNull(),

    /* ── Who this actually is ──────────────────────────────────
       A numeric id makes a conversations list unreadable. These come
       from the User Profile API, which works because a customer
       messaging the shop IS the consent — no permission beyond the
       two already in use.

       All nullable. The fetch can fail, and a customer who has
       blocked the shop has no retrievable profile at all. A
       conversation without a name still works; it shows the id.
       ──────────────────────────────────────────────────────── */
    customerName: text('customer_name'),
    customerUsername: text('customer_username'),
    customerProfilePic: text('customer_profile_pic'),
    followerCount: integer('follower_count'),
    isVerified: boolean('is_verified'),

    // Null means never fetched, or the last attempt failed — which is
    // the signal to try again on the next message.
    profileFetchedAt: timestamp('profile_fetched_at', { withTimezone: true }),

    // 'th' | 'en', fixed on first contact.
    lang: text('lang').notNull().default('th'),

    // Mirrors the Redis handover flag so the dashboard can show which
    // threads the bot is staying quiet on. Redis remains the one the
    // bot actually reads.
    handedOver: boolean('handed_over').notNull().default(false),
    handoverReason: text('handover_reason').notNull().default(''),

    // What the customer's latest message was about, copied from the
    // last classified message. Denormalised so the conversations list
    // can show a topic per row without reading every thread's
    // messages. This is the "by topic" filter, and it costs nothing:
    // analyze() already computes it on every inbound message.
    lastIntent: text('last_intent'),

    lastMessageAt: timestamp('last_message_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('conversations_shop_customer_idx').on(t.shopId, t.customerId),
    index('conversations_recent_idx').on(t.shopId, t.lastMessageAt),
  ]
);

/** 'customer' = they typed it, 'bot' = generated, 'human' = the
 *  seller typed it in Instagram and it came back as an echo. */
export type MessageRole = 'customer' | 'bot' | 'human';

export const messages = pgTable(
  'messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),

    role: text('role').$type<MessageRole>().notNull(),
    text: text('text').notNull().default(''),

    // What analyze() decided about this message. Null for bot and
    // human messages, which are not classified.
    intent: text('intent'),
    tier: integer('tier'),
    tierReason: text('tier_reason').notNull().default(''),

    // What the customer asked for that the shop could not supply, as
    // analyze() reported it: ไซส์ไม่ถูกต้อง, สีไม่ถูกต้อง, สินค้าหมด,
    // จำนวน. This is the restock signal — "someone wanted a colour you
    // don't stock" — and it is the most commercially useful thing the
    // bot learns. It was already being computed and thrown away.
    missing: text('missing').array().notNull().default([]),

    // Set when the message was an image rather than text.
    imageUrl: text('image_url').notNull().default(''),
    imageKind: text('image_kind').notNull().default(''),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId, t.createdAt)]
);

/* ─────────────────────────────────────────────────────────────
   digests — one saved summary per shop per day

   The daily brief costs one Typhoon call. Regenerating it on every
   page view would mean paying for the same sentence repeatedly and
   showing slightly different wording each refresh, so it is written
   once and read from here after.

   `day` is TEXT, not a date, and holds 'YYYY-MM-DD' in the SHOP'S
   timezone — Asia/Bangkok, not UTC. A UTC day boundary falls at 7am
   Bangkok time, which would cut a Thai shop's evening trade in half
   and put it in the wrong day's summary. Storing the already-resolved
   local day string means no query has to reason about timezones.
   ───────────────────────────────────────────────────────────── */

export type DigestStats = {
  conversations: number;
  newCustomers: number;
  messages: number;
  orders: number;
  revenue: number;
  handovers: number;
  /** intent -> count, straight from the messages table */
  topics: Record<string, number>;
  /** Threads that went to a human, with the reason analyze() gave */
  handoverReasons: string[];
  /** What customers asked for and could not have -> how many times */
  wanted: Record<string, number>;
};

export const digests = pgTable(
  'digests',
  {
    id: serial('id').primaryKey(),
    shopId: integer('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),

    /** 'YYYY-MM-DD' in Asia/Bangkok. */
    day: text('day').notNull(),

    /** Two or three lines of Thai. The only part that costs a model call. */
    summary: text('summary').notNull().default(''),

    /** Everything countable. Computed by SQL, no model involved. */
    stats: jsonb('stats').$type<DigestStats>(),

    generatedAt: timestamp('generated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('digests_shop_day_idx').on(t.shopId, t.day)]
);

/* ── Inferred types, so the app never hand-writes a row shape ── */

export type Shop = typeof shops.$inferSelect;
export type NewShop = typeof shops.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Digest = typeof digests.$inferSelect;
