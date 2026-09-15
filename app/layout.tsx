// app/layout.tsx
//
// THE ROOT LAYOUT. This file did not exist.
//
// ─────────────────────────────────────────────────────────────
// WHAT WAS ACTUALLY WRONG
//
// Every page in an App Router project renders inside this file. It is
// the only place that can put a stylesheet on the page — and with no
// root layout, nothing imported one, so no CSS ever reached the
// browser. Every Tailwind class in every page, mine and the ones I
// inherited, has been doing nothing this whole time.
//
// That is why the dashboard looked like plain stacked text: not a
// design problem, not a purge problem. There was no CSS.
//
// It stayed invisible because Next.js fills in a bare root layout
// rather than refusing to build, so the app ran, the pages worked,
// and only the appearance was wrong. Inline styles kept rendering —
// which is why the card borders and the jade links showed up while
// all the spacing and sizing did not.
// ─────────────────────────────────────────────────────────────

import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Thai } from 'next/font/google';
import './globals.css';

// Set here so it applies to every page including /setup and /login,
// instead of each one loading its own copy.
const plex = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ผู้ช่วยร้าน',
  description: 'ผู้ช่วยตอบแชท Instagram และจัดการออเดอร์',

  // Makes "Add to Home Screen" behave like an app rather than a
  // bookmark: no browser chrome, so the bottom tab bar sits where a
  // native app's would. The whole point of the direction we picked.
  appleWebApp: {
    capable: true,
    title: 'ผู้ช่วยร้าน',
    statusBarStyle: 'default',
  },

  // A dashboard full of a shop's private orders has no business in
  // anyone's search results.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Matches the header colour, so the phone's status bar blends into
  // the app instead of sitting on a white strip.
  themeColor: '#F7F8F7',
  // Deliberately NOT maximumScale: 1 — blocking pinch-zoom is a
  // common "app-like" trick and it makes the page unusable for anyone
  // who needs to zoom in to read it.
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" className={plex.className}>
      <body>{children}</body>
    </html>
  );
}