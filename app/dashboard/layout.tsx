// app/dashboard/layout.tsx
//
// The app shell: compact header, the page, the bottom tab bar.
//
// Capped at 640px and centred, so on a desktop this is a phone-shaped
// column. That is the honest cost of the "counter" direction — the
// seller is on a phone; the desktop case is you, checking in.
//
// The locale is read ONCE here and handed to the client components
// that need it (tab bar, toggle, sign-out). Server pages read the
// cookie themselves with tr(), which is cheaper than threading a
// prop through every page.
//
// Note: the typeface and the stylesheet now come from the ROOT layout
// (app/layout.tsx), which did not exist until the CSS fix. This file
// no longer loads a font of its own.

import { getShopConfig } from '../../lib/shop';
import { shopDay } from '../../lib/conversations';
import { getLocale, tr } from '../../lib/i18n-server';
import TabBar from './TabBar';
import LangToggle from './LangToggle';
import LogoutButton from './LogoutButton';
import { C } from './theme';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [shop, locale, t] = await Promise.all([
    getShopConfig().catch(() => null),
    getLocale(),
    tr(),
  ]);

  // Thai and English date formats differ in more than words — Thai
  // uses the Buddhist era. Intl handles both from the same instant.
  const today = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'th-TH', {
    timeZone: process.env.SHOP_TIMEZONE ?? 'Asia/Bangkok',
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${shopDay()}T12:00:00Z`));

  return (
    <div style={{ background: C.ground, color: C.ink, minHeight: '100vh' }}>
      <header
        className="sticky top-0 z-10"
        style={{
          background: 'rgba(247,248,247,0.94)',
          backdropFilter: 'blur(10px)',
          borderBottom: `1px solid ${C.line}`,
        }}
      >
        <div className="mx-auto flex max-w-[640px] items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-bold leading-tight">
              {shop?.shop_name || t('ร้านของคุณ', 'Your shop')}
            </p>
            <p className="text-[12px] leading-tight" style={{ color: C.ink3 }}>
              {today}
            </p>
          </div>

          <LangToggle locale={locale} />

          {/* Settings, not a tab: visited about once a month, and a
              tab slot is worth more than that. */}
          <a
            href="/setup"
            aria-label={t('ตั้งค่าร้าน', 'Shop settings')}
            className="flex h-11 w-11 flex-none items-center justify-center active:opacity-60"
            style={{ color: C.ink2 }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.7" />
              <path
                d="M12 3.5v2M12 18.5v2M4.8 7.8l1.7 1M17.5 15.2l1.7 1M4.8 16.2l1.7-1M17.5 8.8l1.7-1"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          </a>
        </div>
      </header>

      <main className="mx-auto flex max-w-[640px] flex-col gap-7 px-4 pt-5">
        {children}

        {/* Quiet, at the foot of every page. pb-28 clears the fixed
            tab bar; without it the last row looks cut off. */}
        <div
          className="flex justify-center border-t pb-28 pt-6"
          style={{ borderColor: C.line }}
        >
          <LogoutButton locale={locale} />
        </div>
      </main>

      <TabBar locale={locale} />
    </div>
  );
}
