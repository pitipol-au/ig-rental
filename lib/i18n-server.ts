// lib/i18n-server.ts
//
// The locale, read from the cookie. SERVER COMPONENTS ONLY.
//
// Separate from lib/i18n.ts because that file has to be importable
// from client components, and this one uses next/headers — which,
// anywhere in a module's import graph, makes the whole module
// server-only. See the note at the top of lib/i18n.ts.

import { cookies } from 'next/headers';
import { LOCALE_COOKIE, DEFAULT_LOCALE, pick, type Locale } from './i18n';

/** The current locale. */
export async function getLocale(): Promise<Locale> {
  try {
    const raw = (await cookies()).get(LOCALE_COOKIE)?.value;
    return raw === 'en' ? 'en' : 'th';
  } catch {
    // cookies() throws outside a request scope. Never a reason to
    // fail a page render.
    return DEFAULT_LOCALE;
  }
}

/**
 * The translator.
 *
 *   const t = await tr();
 *   <h2>{t('ที่ต้องทำ', 'To do')}</h2>
 */
export async function tr(): Promise<(th: string, en: string) => string> {
  return pick(await getLocale());
}
