// app/dashboard/layout.tsx
//
// The shell every dashboard page sits inside: shop name, navigation,
// logout.
//
// Behind the password via proxy.ts, which now covers /dashboard. That
// matters more here than on /setup — this page shows customers' names
// and messages, not just shop configuration.
//
// Navigation lists only pages that exist. Products, orders and chats
// join it as they land; a nav item pointing at a 404 is worse than a
// nav item that isn't there yet.

import { IBM_Plex_Sans_Thai } from 'next/font/google';
import { getShopConfig } from '../../lib/shop';
// Lives under app/start because that is where it was first needed.
// Shared rather than duplicated; it will move when /start folds into
// this dashboard.
import LogoutButton from '../start/LogoutButton';
import { C } from './tokens';

const plex = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600'],
});

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/dashboard', label: 'วันนี้' },
  { href: '/setup', label: 'ตั้งค่าร้าน' },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const shop = await getShopConfig().catch(() => null);

  return (
    <div
      className={plex.className}
      style={{ background: C.paper, minHeight: '100vh', color: C.ink }}
    >
      <header className="border-b" style={{ borderColor: C.rule, background: C.surface }}>
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-6 py-4">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <span className="text-base font-semibold">
              {shop?.shop_name || 'ร้านของคุณ'}
            </span>
            <nav className="flex flex-wrap gap-x-5 gap-y-1">
              {NAV.map(n => (
                <a
                  key={n.href}
                  href={n.href}
                  className="text-sm underline-offset-4 hover:underline"
                  style={{ color: C.pen }}
                >
                  {n.label}
                </a>
              ))}
            </nav>
          </div>
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 lg:py-14">{children}</main>
    </div>
  );
}
