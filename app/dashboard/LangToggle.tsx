// app/dashboard/LangToggle.tsx
//
// TH / EN. Two words, one tap.
//
// Sets the cookie straight from the browser rather than posting to an
// API route. It is a display preference, not a secret, so there is
// nothing to protect and no round trip worth paying for.
//
// router.refresh() re-runs the server components with the new cookie
// and swaps in the new HTML — no full reload, so scroll position
// survives and the page does not flash white.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { C } from './theme';
import type { Locale } from '../../lib/i18n';
import { LOCALE_COOKIE } from '../../lib/i18n';

export default function LangToggle({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const set = (next: Locale) => {
    if (next === locale) return;
    setBusy(true);
    // A year, so the choice sticks. SameSite=Lax is enough for a
    // preference that only this site reads.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
    // The refresh is async; the button re-enables when the new HTML
    // arrives and this component re-mounts with the new locale.
    setTimeout(() => setBusy(false), 600);
  };

  return (
    <div
      className="flex flex-none overflow-hidden"
      style={{ border: `1px solid ${C.line}`, borderRadius: 8, opacity: busy ? 0.5 : 1 }}
      role="group"
      aria-label="ภาษา / Language"
    >
      {(['th', 'en'] as const).map(l => {
        const on = l === locale;
        return (
          <button
            key={l}
            onClick={() => set(l)}
            disabled={busy}
            aria-pressed={on}
            className="min-h-[32px] px-2.5 text-[12px] font-bold uppercase active:opacity-60"
            style={{
              background: on ? C.accent : 'transparent',
              color: on ? '#FFFFFF' : C.ink3,
            }}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
