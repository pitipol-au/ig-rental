// app/dashboard/layout.tsx
//
// The app shell: a compact header, the page, and the bottom tab bar.
//
// Capped at 640px and centred. On a desktop this is a phone-shaped
// column in the middle of the screen — which is the honest trade-off
// of the direction we picked. The seller uses this on a phone; the
// desktop case is you, checking on it. If that becomes wrong, the
// width cap here is the one line to change.
//
// Behind the password via proxy.ts, which covers /dashboard and
// everything under it. That matters more here than on /setup: these
// pages show customers' names and their messages.

import { IBM_Plex_Sans_Thai } from 'next/font/google';
import { getShopConfig } from '../../lib/shop';
import { shopDay } from '../../lib/conversations';
import TabBar from './TabBar';
import LogoutButton from './LogoutButton';
import { C } from './theme';

// IBM Plex Sans Thai, not Anuphan as pitched in the mockup. Plex is
// already in this project and already proven to build here, and
// swapping the typeface is a one-line change you can make later
// without touching anything else. Not worth risking a build failure
// on the same push that changes every page.
const plex = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
});

export const dynamic = 'force-dynamic';

const THAI_DATE = new Intl.DateTimeFormat('th-TH', {
  timeZone: process.env.SHOP_TIMEZONE ?? 'Asia/Bangkok',
  weekday: 'short',
  day: 'numeric',
  month: 'long',
});

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const shop = await getShopConfig().catch(() => null);
  const today = THAI_DATE.format(new Date(`${shopDay()}T12:00:00Z`));

  return (
    <div
      className={plex.className}
      style={{ background: C.ground, color: C.ink, minHeight: '100vh' }}
    >
      <header
        className="sticky top-0 z-10"
        style={{
          background: 'rgba(247,248,247,0.94)',
          backdropFilter: 'blur(10px)',
          borderBottom: `1px solid ${C.line}`,
        }}
      >
        <div className="mx-auto flex max-w-[640px] items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[16px] font-bold leading-tight">
              {shop?.shop_name || 'ร้านของคุณ'}
            </p>
            <p className="text-[12px] leading-tight" style={{ color: C.ink3 }}>
              {today}
            </p>
          </div>

          {/* Settings, not a nav tab: it is visited once a month, and a
              tab slot is too valuable for that. */}
          <a
            href="/setup"
            aria-label="ตั้งค่าร้าน"
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

      {/* pb-28 clears the fixed tab bar. Without it the last row of
          every page sits underneath it and looks cut off. */}
      <main className="mx-auto flex max-w-[640px] flex-col gap-7 px-4 pt-5">
        {children}

        {/* Quiet, at the end of every page rather than in the header:
            signing out is rare, and a header slot is worth more than
            that. pb-28 clears the fixed tab bar. */}
        <div
          className="flex justify-center border-t pb-28 pt-6"
          style={{ borderColor: C.line }}
        >
          <LogoutButton />
        </div>
      </main>

      <TabBar />
    </div>
  );
}
