// app/api/health/route.ts
//
// One endpoint that tells you whether the external services are
// reachable. Visit this after any deploy or env change.
//
// Sheets is gone; Postgres took its place. The reason to check this
// first has not changed: when the bot starts inventing product
// details, it is almost always because the catalog read failed and
// the bot is working from nothing.
//
// Behind the login now (see proxy.ts), so an uptime monitor pointed
// here will get a 401. That wants its own key rather than the shop
// password — not built yet.

import { checkRedis } from '../../../lib/memory';
import { checkDatabase } from '../../../lib/db';
import { getProducts } from '../../../lib/catalog';
import { getShopConfig } from '../../../lib/shop';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [database, redis] = await Promise.all([
    checkDatabase(),
    checkRedis(),
  ]);

  const ig = await fetch(
    `https://graph.instagram.com/v23.0/me?fields=id,username` +
    `&access_token=${process.env.IG_ACCESS_TOKEN}`,
    { cache: 'no-store' }
  )
    .then(async r =>
      r.ok ? { ok: true, ...(await r.json()) } : { ok: false, status: r.status }
    )
    .catch((e) => ({ ok: false, error: String(e) }));

  // The number that actually predicts hallucinations. Zero products
  // with a healthy database means sync has never run or the token
  // was dead when it did.
  const catalog = database.ok
    ? await getProducts()
        .then(rows => ({
          ok: rows.length > 0,
          products: rows.length,
          missingPrice: rows.filter(r => r.price === null).length,
          soldOut: rows.filter(r => !r.inStock).length,
        }))
        .catch((e) => ({ ok: false, error: String(e) }))
    : { ok: false, error: 'database unreachable' };

  const shop = database.ok
    ? await getShopConfig()
        .then(c => ({ ok: Boolean(c.shop_name), name: c.shop_name, shipping: c.shipping_cost }))
        .catch((e) => ({ ok: false, error: String(e) }))
    : { ok: false, error: 'database unreachable' };

  const ok =
    database.ok && redis.ok && (ig as any).ok && (catalog as any).ok;

  return Response.json(
    { ok, database, redis, instagram: ig, catalog, shop },
    { status: ok ? 200 : 500 }
  );
}
