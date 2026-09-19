// proxy.ts
//
// Goes in the PROJECT ROOT — next to app/ and lib/, not inside them.
//
// In Next.js 16 this file is called proxy.ts and the function must be
// called proxy(). It used to be middleware.ts / middleware(); that
// name still works but is deprecated and prints a warning. If you see
// a tutorial using middleware.ts, this is the same thing.
//
// This runs before any protected page or API route renders, and is the
// only place the login check lives, so there is one rule rather than a
// check repeated in every file.
//
// ─────────────────────────────────────────────────────────────
// THE ONE THING THAT MUST NOT BREAK
//
// /api/webhooks/instagram is NOT in the matcher below and must never
// be added to it. Meta's servers call that URL. They have no password
// and no cookie. If this file ever starts guarding that route, every
// customer DM gets a 401, Meta retries for a few minutes and gives up,
// and the bot goes completely silent — with no error anywhere, because
// from the app's point of view nothing failed.
//
// Meta's dashboard has no webhook delivery log, so there is nothing to
// check afterwards either.
//
// That is why the matcher is a short explicit LIST of the paths to
// protect, rather than the "protect everything except…" pattern most
// examples use. A typo in a negative pattern silently swallows the
// webhook. A typo in this list just leaves a page unprotected, which
// is visible the moment you open it in a private window.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { COOKIE_NAME, verifySession } from './lib/auth';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const ok = await verifySession(request.cookies.get(COOKIE_NAME)?.value);
  if (ok) return NextResponse.next();

  // An API call gets a status code, not a redirect. Returning HTML to
  // fetch() shows up as "Unexpected token '<'" in the browser console,
  // which looks like a broken app rather than a login problem.
  if (pathname.startsWith('/api/')) {
    return Response.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 }
    );
  }

  // A page gets the login screen, remembering where it was headed so
  // the bookmark the owner clicked still lands in the right place.
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Both spellings of each path: '/setup' alone and '/setup/anything'.
  //
  // NOT listed, on purpose:
  //   /api/webhooks/instagram — Meta calls it (see the note above)
  //   /login, /api/login      — the way in
  matcher: [
    '/dashboard',
    '/dashboard/:path*',
    '/setup',
    '/setup/:path*',
    '/start',
    '/start/:path*',
    '/api/setup',
    '/api/setup/:path*',
    '/api/products',
    '/api/products/:path*',
    '/api/orders',
    '/api/orders/:path*',
    '/api/handover',
    '/api/handover/:path*',
    '/api/sync',
    '/api/sync/:path*',
    '/api/health',
    '/api/health/:path*',
  ],
};