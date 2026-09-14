// lib/auth.ts
//
// One shared password for the whole app, held in an env var, plus a
// signed cookie so the password is typed once and not again.
//
// WHY NOT A USER DATABASE
// There is exactly one shop per deployment. A users table would add a
// service to run, rows to migrate, and a password-reset flow to build,
// and would protect the same single set of pages. When a second shop
// arrives it gets its own deployment and its own password.
//
// WHY A SIGNED COOKIE AND NOT "THE PASSWORD IN A COOKIE"
// A cookie holding the password means the password sits in the
// browser, in logs, in analytics, in anything that reads headers. This
// stores a timestamp plus a signature instead. The signature proves the
// timestamp came from this server; the timestamp makes the cookie
// expire on its own. The password itself never leaves the env var.
//
// WHY WEB CRYPTO AND NOT node:crypto
// Web Crypto is available in every runtime this app could run on —
// Node, Vercel, Cloudflare. If the app moves off Vercel later (it
// should, see the Hobby licensing note), this file does not change.

const COOKIE_NAME = 'shop_session';

/** 30 days. Long enough that the shop owner isn't fighting a login
 *  screen; short enough that a forgotten laptop stops working. */
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

const enc = new TextEncoder();

/* ─────────────────────────────────────────────────────────────
   Configuration
   ───────────────────────────────────────────────────────────── */

/**
 * Returns null rather than throwing when unset.
 *
 * Auth fails CLOSED: a missing secret locks everyone out, including
 * the shop owner. That is the opposite of the Redis defaults
 * elsewhere in this codebase, and deliberately so — the cost of a
 * locked-out owner is a support message, the cost of an open /setup
 * is a stranger editing the shop's config.
 */
function getSecret(): string | null {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    console.error(
      '[AUTH] AUTH_SECRET is missing or under 16 characters. ' +
      'Every protected page will refuse access until it is set.'
    );
    return null;
  }
  return s;
}

function getPassword(): string | null {
  const p = process.env.APP_PASSWORD;
  if (!p || p.length < 8) {
    console.error(
      '[AUTH] APP_PASSWORD is missing or under 8 characters. ' +
      'Login will refuse every attempt until it is set.'
    );
    return null;
  }
  return p;
}

/** True when both env vars are present — used by the login page to
 *  show a useful message instead of a silent failure. */
export function isAuthConfigured(): boolean {
  return getSecret() !== null && getPassword() !== null;
}

/* ─────────────────────────────────────────────────────────────
   Primitives
   ───────────────────────────────────────────────────────────── */

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return base64url(new Uint8Array(sig));
}

/**
 * Compares two strings without leaking, through timing, how much of
 * the string matched. A plain === returns faster on an early mismatch,
 * which over many attempts reveals the value one character at a time.
 *
 * Only safe when both inputs are the same length, so every caller
 * below compares signatures (always 43 characters), never raw secrets.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ─────────────────────────────────────────────────────────────
   Password check
   ───────────────────────────────────────────────────────────── */

/**
 * Both sides are hashed before comparing, so the comparison is always
 * over two 43-character strings. Comparing the raw strings would leak
 * the password's LENGTH through the length check in safeEqual.
 */
export async function checkPassword(input: string): Promise<boolean> {
  const secret = getSecret();
  const expected = getPassword();
  if (!secret || !expected) return false;
  if (typeof input !== 'string' || input.length === 0) return false;

  const [a, b] = await Promise.all([
    sign(`pw:${input}`, secret),
    sign(`pw:${expected}`, secret),
  ]);
  return safeEqual(a, b);
}

/* ─────────────────────────────────────────────────────────────
   Session token
   ───────────────────────────────────────────────────────────── */

/** Token shape: "<expiry-in-ms>.<signature-of-that-expiry>" */
export async function createSession(): Promise<string | null> {
  const secret = getSecret();
  if (!secret) return null;

  const exp = String(Date.now() + SESSION_MS);
  return `${exp}.${await sign(exp, secret)}`;
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  const secret = getSecret();
  if (!secret || !token) return false;

  const dot = token.indexOf('.');
  if (dot < 1) return false;

  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  // Expiry is checked BEFORE the signature so an expired token is
  // cheap to reject. Both must pass.
  const expMs = Number(exp);
  if (!Number.isFinite(expMs) || expMs < Date.now()) return false;

  return safeEqual(sig, await sign(exp, secret));
}

/* ─────────────────────────────────────────────────────────────
   Cookie
   ───────────────────────────────────────────────────────────── */

export { COOKIE_NAME, SESSION_MS };

/**
 * httpOnly  — JavaScript on the page cannot read it, so a script
 *             injected through any means cannot steal the session.
 * sameSite  — 'lax' blocks another site from posting to /api/setup
 *             using this cookie, while still surviving a normal click
 *             from an email or bookmark.
 * secure    — HTTPS only in production. Off locally, because
 *             http://localhost would otherwise never receive it.
 */
export function sessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(SESSION_MS / 1000),
  };
}