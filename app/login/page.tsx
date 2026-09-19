// app/login/page.tsx
//
// One password field, rebuilt in the counter's visual language.
//
// Reachable without a session by design — it is the way in, so it is
// not in the proxy matcher.
//
// Phone-shaped: the field is 52px tall with 17px text, because 16px or
// larger is what stops iOS Safari zooming the whole page in when the
// field is focused. A login screen that jumps as you tap it is the
// first thing a client sees.
//
// The show/hide eye matters more here than on a normal login: this
// password gets read out over the phone to a shop owner, typed on a
// phone keyboard, and there is no "forgot password" to fall back on.
// Being able to see what you typed is the difference between getting
// in and calling the installer.
//
// ─────────────────────────────────────────────────────────────
// THE GREEN BOX
//
// app/globals.css draws a green ring around whatever has keyboard
// focus. That is deliberate and should stay — without it, anyone
// using a keyboard cannot see where they are on the page.
//
// The problem was that it landed on the <input> alone, so the ring
// cut straight through the middle of the field and left the eye
// button sitting outside it, as if the two were unrelated controls.
//
// Fixed by moving the ring up one level: the input and the button
// each turn their own outline off, and the box that holds both of
// them draws the ring instead. Tap anywhere in the field and the
// whole thing lights up as one control, eye included.
//
// The outlines are switched off with inline style rather than a
// Tailwind class, because a plain CSS rule in globals.css beats a
// Tailwind utility (utilities live in a CSS layer, and unlayered
// rules win) — outline-none looked right in the code and did
// nothing on screen. An inline style beats both.
// ─────────────────────────────────────────────────────────────
'use client';

import { useState } from 'react';
import { IBM_Plex_Sans_Thai } from 'next/font/google';
import { C, R } from '../dashboard/theme';

const plex = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
});

/**
 * Where to go after logging in.
 *
 * Read from the URL at submit time rather than with useSearchParams,
 * which would force this page into a Suspense boundary for no gain.
 *
 * The leading-slash check matters: without it, /login?next=https://
 * evil.example turns this page into a redirector someone can put in a
 * link, landing the owner on a copy of this screen that keeps their
 * password.
 */
function destination(): string {
  if (typeof window === 'undefined') return '/dashboard';
  const raw = new URLSearchParams(window.location.search).get('next');
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/dashboard';
  return raw;
}

export default function Login() {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which part of the field has focus: nothing, the text box, or the
  // eye. The ring only needs to know "something", but the eye needs
  // its own quiet marker too — otherwise a keyboard user tabbing from
  // the box to the eye sees the ring not move and cannot tell the
  // focus went anywhere.
  const [focus, setFocus] = useState<'none' | 'input' | 'eye'>('none');
  const lit = focus !== 'none';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.status === 429) {
        setError('ลองผิดหลายครั้งเกินไป รอ 10 นาทีแล้วลองอีกครั้งค่ะ');
        return;
      }
      if (!res.ok) {
        setError('รหัสไม่ถูกต้อง');
        setPassword('');
        return;
      }

      // A full page load, not a client route change: the cookie was
      // only just set and the server has to see it on a fresh request
      // before it will serve the dashboard.
      window.location.href = destination();
    } catch {
      setError('เชื่อมต่อไม่ได้ ลองอีกครั้งค่ะ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={plex.className}
      style={{ background: C.ground, color: C.ink, minHeight: '100vh' }}
    >
      <div className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-5 py-14">
        <div
          className="h-12 w-12"
          style={{ background: C.accent, borderRadius: R.chip }}
          aria-hidden="true"
        >
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <path
              d="M16 19h16v13a1 1 0 0 1-1 1H17a1 1 0 0 1-1-1V19Z"
              stroke="#fff"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path d="M20 19v-2a4 4 0 0 1 8 0v2" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>

        <h1 className="mt-6 text-[26px] font-bold leading-tight">ผู้ช่วยร้าน</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed" style={{ color: C.ink2 }}>
          ใส่รหัสที่ผู้ติดตั้งให้ไว้ ใส่ครั้งเดียว เครื่องนี้จะจำไว้ 30 วัน
        </p>

        <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-[13px] font-semibold"
              style={{ color: C.ink2 }}
            >
              รหัสเข้าใช้งาน
            </label>

            {/* The field and its eye share one bordered box, and that
                box is what carries the focus ring — so the green
                outline wraps both, not just the text half. */}
            <div
              className="flex items-center"
              style={{
                background: C.surface,
                border: `1px solid ${
                  error ? C.urgentLine : lit ? C.accent : C.line
                }`,
                borderRadius: R.chip,
                height: 52,
                outline: lit ? `2px solid ${C.accent}` : 'none',
                outlineOffset: 2,
              }}
            >
              <input
                id="password"
                type={show ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onFocus={() => setFocus('input')}
                onBlur={() => setFocus('none')}
                autoFocus
                autoComplete="current-password"
                className="min-w-0 flex-1 bg-transparent px-4"
                style={{
                  fontSize: 17,
                  color: C.ink,
                  height: '100%',
                  // The box around us draws the ring now.
                  outline: 'none',
                }}
              />

              <button
                type="button"
                onClick={() => setShow(v => !v)}
                // type="button" matters: inside a form, a button with
                // no type defaults to submit, so tapping the eye would
                // try to log in with a half-typed password.
                onFocus={() => setFocus('eye')}
                onBlur={() => setFocus('none')}
                aria-label={show ? 'ซ่อนรหัส' : 'แสดงรหัส'}
                aria-pressed={show}
                className="flex h-[46px] w-[46px] flex-none items-center justify-center active:opacity-60"
                style={{
                  color: focus === 'eye' ? C.accent : C.ink3,
                  background: focus === 'eye' ? C.accentSoft : 'transparent',
                  borderRadius: R.chip,
                  marginRight: 3,
                  outline: 'none',
                }}
              >
                {show ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy || password.length === 0}
            className="w-full font-semibold active:opacity-70 disabled:opacity-40"
            style={{
              background: C.accent,
              color: '#FFFFFF',
              borderRadius: R.chip,
              height: 52,
              fontSize: 16,
            }}
          >
            {busy ? 'กำลังตรวจสอบ…' : 'เข้าใช้งาน'}
          </button>

          {error && (
            <p
              className="px-3.5 py-2.5 text-[13.5px] font-medium"
              style={{ background: C.urgentTint, color: C.urgent, borderRadius: R.chip }}
              role="alert"
            >
              {error}
            </p>
          )}
        </form>

        <p
          className="mt-10 border-t pt-6 text-[13px] leading-relaxed"
          style={{ borderColor: C.line, color: C.ink3 }}
        >
          ลืมรหัส? ติดต่อผู้ติดตั้งระบบ รหัสนี้ตั้งไว้ในระบบ ไม่ได้เก็บไว้ในหน้านี้
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   The eye

   Two distinct shapes, not one icon with a colour change: whether a
   password is visible is a state worth being able to read at a
   glance, and a struck-through eye says "hidden" even to someone who
   cannot pick up the colour difference.
   ───────────────────────────────────────────────────────────── */

function Eye() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12S6 5.5 12 5.5c1.6 0 3 .5 4.2 1.1M21.5 12s-1.2 2.2-3.4 4M9.9 9.9a3 3 0 1 0 4.2 4.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}