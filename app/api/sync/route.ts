// app/api/sync/route.ts
//
// Manual catalog sync. Visit after posting a new product to add it
// immediately rather than waiting for the throttled background sync.
//
// Unchanged except for the extra `refreshed` count in the response —
// sync now updates captions on existing products too, and the seller
// should be able to see that something happened even when no new
// product was added.

import { syncProducts } from '../../../lib/sync';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await syncProducts();
    return Response.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('Sync failed:', err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
