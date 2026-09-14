// app/api/sync/route.ts
//
// Manual catalog sync. Visit after posting a new product to add it
// immediately rather than waiting for the throttled background sync.

import { syncProducts } from '../../../lib/sync';

export async function GET() {
  try {
    const result = await syncProducts();
    return Response.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('Sync failed:', err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}