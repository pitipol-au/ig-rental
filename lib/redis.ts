// lib/redis.ts
//
// One shared Upstash client.
//
// memory.ts and app/api/login/route.ts each construct their own. That
// is harmless — the Upstash REST client is a stateless fetch wrapper,
// not a connection pool, so there is nothing to duplicate or exhaust —
// but three copies of the same two env vars is three places to get it
// wrong. New code imports this. The other two can move over whenever
// they are next touched; there is no urgency.

import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/**
 * Claim a named time window, across every instance.
 *
 * Returns true for the first caller in the window and false for
 * everyone else. Same SET NX trick claimMessage() uses, for the same
 * reason: on serverless there is no shared process to hold a
 * "last run at" variable.
 */
export async function claimWindow(
  key: string,
  seconds: number
): Promise<boolean> {
  try {
    const res = await redis.set(`window:${key}`, Date.now(), {
      nx: true,
      ex: seconds,
    });
    return res === 'OK';
  } catch (err) {
    // Fail toward doing the work. A throttle that blocks when Redis
    // is down would stop the catalog updating for as long as the
    // outage lasts; doing the work twice costs one extra API call.
    console.error(`claimWindow(${key}) failed, running anyway:`, err);
    return true;
  }
}
