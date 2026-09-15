// app/dashboard/TabBar.tsx
//
// The bottom tab bar. The reason this direction was chosen: orders
// and chats are always one thumb-reach away, never a scroll.
//
// A client component, because it needs to know which tab is active and
// that means reading the current path in the browser.
//
// Two details that matter on a real phone:
//
//   env(safe-area-inset-bottom) — on an iPhone the bar would sit
//   under the home indicator without it, and the last tab becomes
//   un-tappable.
//
//   56px minimum height per tab — a thumb is about 45px across. Any
//   smaller and the owner mis-taps while standing at a market stall,
//   which is exactly where this gets used.
'use client';

import { usePathname } from 'next/navigation';
import { C } from './theme';
import { pick, type Locale } from '../../lib/i18n';

// Labels live as pairs rather than keys: both languages sit where the
// tab is defined, so neither can go missing.
const TABS = [
  { href: '/dashboard', th: 'วันนี้', en: 'Today', icon: Today },
  { href: '/dashboard/products', th: 'สินค้า', en: 'Products', icon: Tag },
  { href: '/dashboard/orders', th: 'ออเดอร์', en: 'Orders', icon: Receipt },
  { href: '/dashboard/chats', th: 'แชท', en: 'Chats', icon: Chat },
];

export default function TabBar({ locale }: { locale: Locale }) {
  const path = usePathname();
  const t = pick(locale);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20"
      style={{
        background: 'rgba(255,255,255,0.96)',
        backdropFilter: 'blur(10px)',
        borderTop: `1px solid ${C.line}`,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      aria-label={t('เมนูหลัก', 'Main menu')}
    >
      <div className="mx-auto grid max-w-[640px] grid-cols-4">
        {TABS.map(tab => {
          // Exact match for the index tab, prefix match for the rest,
          // so /dashboard/chats/12345 still lights up แชท.
          const active =
            tab.href === '/dashboard' ? path === '/dashboard' : path.startsWith(tab.href);
          const Icon = tab.icon;

          return (
            <a
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 active:opacity-60"
              style={{ color: active ? C.accent : C.ink3 }}
            >
              <Icon active={active} />
              <span
                className="text-[11px]"
                style={{ fontWeight: active ? 700 : 500 }}
              >
                {t(tab.th, tab.en)}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

/* ─────────────────────────────────────────────────────────────
   Icons, drawn here rather than pulled from an icon package.
   Four shapes is not worth a dependency, and lucide-react would
   ship a few hundred kilobytes to draw them.

   Filled when active, outlined when not — so the active tab is not
   signalled by colour alone.
   ───────────────────────────────────────────────────────────── */

type IconProps = { active?: boolean };

function Today({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={active ? 'currentColor' : 'none'}
        fillOpacity={active ? 0.15 : 0}
      />
    </svg>
  );
}

function Tag({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12.6 3.6 21 12l-8.4 8.4a2 2 0 0 1-2.8 0L3 13.6V5a2 2 0 0 1 2-2h8.6Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        fill={active ? 'currentColor' : 'none'}
        fillOpacity={active ? 0.15 : 0}
      />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" />
    </svg>
  );
}

function Receipt({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 3h12v18l-3-1.8-3 1.8-3-1.8L6 21V3Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        fill={active ? 'currentColor' : 'none'}
        fillOpacity={active ? 0.15 : 0}
      />
      <path d="M9.5 8.5h5M9.5 12h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function Chat({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-5 4V5.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        fill={active ? 'currentColor' : 'none'}
        fillOpacity={active ? 0.15 : 0}
      />
    </svg>
  );
}
