// lib/db/index.ts
//
// The database connection, plus the two helpers everything else uses:
// getShopId() and a small read cache.
//
// WHY THE HTTP DRIVER (neon-http) AND NOT A POOL
// A normal Postgres connection is a socket held open. On serverless
// there is no long-lived process to hold it: each webhook lands on a
// possibly-new instance, opens a connection, and abandons it. A few
// hundred DMs and the database is out of connection slots — this is
// the single most common way a serverless app takes down its own
// database. Neon's HTTP driver sends each query as one HTTPS request
// instead, so there is nothing to exhaust.
//
// The cost: no transactions across multiple statements over HTTP.
// Nothing in this app needs them. If something ever does, that query
// switches to `neon-serverless` (websockets) on its own.

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, sql } from 'drizzle-orm';
import * as schema from './schema';
import { shops } from './schema';

if (!process.env.DATABASE_URL) {
  // Loud and early. A missing URL otherwise surfaces as a confusing
  // "fetch failed" on the first query, inside whatever happened to
  // run first.
  console.error('[DB] DATABASE_URL is not set — every query will fail.');
}

const client = neon(process.env.DATABASE_URL ?? '');

export const db = drizzle({ client, schema });
export { schema };

/* ─────────────────────────────────────────────────────────────
   Which shop

   One shop per deployment for now, identified by slug. Everything
   goes through this function rather than assuming id 1, so the day a
   second shop exists there is exactly one place that changes.
   ───────────────────────────────────────────────────────────── */

export const DEFAULT_SHOP_SLUG = process.env.SHOP_SLUG ?? 'default';

let shopIdCache: number | null = null;

/**
 * The current shop's id, creating the row on first call.
 *
 * Created on demand rather than by a seed script, so a fresh
 * deployment works without anyone remembering to run something. The
 * onConflictDoNothing makes two instances racing on a cold start
 * harmless — one inserts, the other reads.
 */
export async function getShopId(): Promise<number> {
  if (shopIdCache !== null) return shopIdCache;

  const slug = DEFAULT_SHOP_SLUG;

  await db.insert(shops).values({ slug }).onConflictDoNothing();

  const [row] = await db
    .select({ id: shops.id })
    .from(shops)
    .where(eq(shops.slug, slug))
    .limit(1);

  if (!row) throw new Error(`Shop "${slug}" could not be created or found`);

  shopIdCache = row.id;
  return row.id;
}

/* ─────────────────────────────────────────────────────────────
   Read cache

   Every inbound DM reads the catalog and the shop settings twice —
   once in extract.ts to classify, once in ai.ts to reply. Without a
   cache that is four round trips per message before the model is even
   called.

   30 seconds, deliberately short. The whole appeal of the old
   spreadsheet was that an edit took effect immediately; a seller who
   fixes a price and sees the bot quote the old one for two minutes
   will not trust the dashboard. 30 seconds reads as instant and still
   removes almost every query.

   Per-instance, like the catalog cache already was. Serverless
   instances each keep their own copy, so an edit can take effect on
   one instance before another — harmless for reading a price,
   which is why this is a cache and not where state lives. Anything
   that must be consistent across instances is in Redis.
   ───────────────────────────────────────────────────────────── */

const CACHE_TTL_MS = 30 * 1000;

/**
 * The cache keys, named here rather than as string literals at each
 * call site. sync.ts has to invalidate the key catalog.ts wrote, and
 * two loose 'catalog' strings that must agree is the kind of thing
 * that silently stops matching after a rename — the seller then edits
 * a price and the bot quotes the old one until the process restarts.
 */
export const CACHE_KEYS = {
  catalog: 'catalog',
  shop: 'shop',
} as const;

type Entry = { value: unknown; at: number };
const cache = new Map<string, Entry>();

export async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;

  const value = await load();
  cache.set(key, { value, at: Date.now() });
  return value;
}

/** Called after a dashboard write so the seller sees their own edit
 *  immediately on this instance. */
export function invalidate(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

/* ─────────────────────────────────────────────────────────────
   Health
   ───────────────────────────────────────────────────────────── */

export async function checkDatabase(): Promise<{
  ok: boolean;
  shopId?: number;
  error?: string;
}> {
  try {
    await db.execute(sql`select 1`);
    return { ok: true, shopId: await getShopId() };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}
