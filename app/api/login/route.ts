// app/api/login/route.ts
//
// POST   — check the password, hand back a session cookie
// DELETE — log out (clear the cookie)
//
// This route is deliberately NOT in the proxy matcher. It is the way
// in, so it cannot require being already in.

import { cookies } from 'next/headers';
import { Redis } from '@upstash/redis';
import {
  checkPassword,
  createSession,
  sessionCookieOptions,
  COOKIE_NAME,
} from '../../../lib/auth';

/* ─────────────────────────────────────────────────────────────
   Attempt throttling
//
   One shared password is guessable if a script can try it a few
   thousand times a minute. This caps attempts per IP.

   Redis is already here for conversation state, so this adds no new
   service. If Redis is unreachable the throttle is SKIPPED rather
   than blocking login — the password is still required, and locking
   the shop owner out of their own dashboard because a cache is down
   is a worse failure than a slower brute force. Every skip is logged.
   ───────────────────────────────────────────────────────────── */

const MAX_ATTEMPTS = 10;
const WINDOW_SECONDS = 10 * 60;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

function clientIp(req: Request): string {
  // Vercel and most proxies set x-forwarded-for. First entry is the
  // real client; the rest are proxies along the way.
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

/** @returns true when this IP has attempts left. */
async function underLimit(ip: string): Promise<boolean> {
  try {
    const key = `login:${ip}`;
    const n = await redis.incr(key);
    // Set the window on the first attempt only, so the window does not
    // keep sliding forward with each new try.
    if (n === 1) await redis.expire(key, WINDOW_SECONDS);
    return n <= MAX_ATTEMPTS;
  } catch (err) {
    console.error('[AUTH] Throttle check skipped, Redis unreachable:', err);
    return true;
  }
}

async function clearAttempts(ip: string): Promise<void> {
  try {
    await redis.del(`login:${ip}`);
  } catch {
    // Nothing to do — the key expires on its own.
  }
}

/* ─────────────────────────────────────────────────────────────
   Handlers
   ───────────────────────────────────────────────────────────── */

export async function POST(req: Request) {
  const ip = clientIp(req);

  if (!(await underLimit(ip))) {
    console.warn(`[AUTH] Too many attempts from ${ip}`);
    return Response.json(
      { ok: false, error: 'too_many_attempts' },
      { status: 429 }
    );
  }

  let password = '';
  try {
    const body = await req.json();
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    return Response.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  if (!(await checkPassword(password))) {
    console.warn(`[AUTH] Failed login from ${ip}`);
    // Same message whether the password was wrong or the server is
    // misconfigured. Telling a stranger "APP_PASSWORD is not set" is
    // telling them the door is unlocked.
    return Response.json({ ok: false, error: 'invalid' }, { status: 401 });
  }

  const token = await createSession();
  if (!token) {
    // checkPassword already returned true, so the secret was present a
    // moment ago. Reaching here means a config change mid-request.
    return Response.json({ ok: false, error: 'invalid' }, { status: 401 });
  }

  (await cookies()).set({ ...sessionCookieOptions(), value: token });
  await clearAttempts(ip);
  console.log(`[AUTH] Logged in from ${ip}`);

  return Response.json({ ok: true });
}

export async function DELETE() {
  (await cookies()).set({ ...sessionCookieOptions(), value: '', maxAge: 0 });
  return Response.json({ ok: true });
}