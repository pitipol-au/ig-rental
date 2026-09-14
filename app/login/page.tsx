// app/login/page.tsx
//
// One password field. Nothing else on the page, because there is
// nothing else the shop owner can do here.
//
// Reachable without a session, by design — it is the way in, so it is
// not in the proxy matcher.
'use client';

import { useState } from 'react';
import { IBM_Plex_Sans_Thai } from 'next/font/google';

const plex = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600'],
});

const C = {
  paper: '#F5F6F3',
  ink: '#1A1D1A',
  stamp: '#C8332E',
  rule: '#E2E5DE',
  muted: '#6B716A',
};

/**
 * Where to go after logging in.
 *
 * Read from the URL at click time rather than with useSearchParams,
 * which forces this page into a Suspense boundary for no benefit here.
 *
 * The leading-slash check matters: without it, /login?next=https://
 * evil.example turns this page into a redirector that an attacker can
 * put in a link, and the shop owner lands on a copy of this login
 * screen that keeps their password.
 */
function destination(): string {
  if (typeof window === 'undefined') return '/start';
  const raw = new URLSearchParams(window.location.search).get('next');
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/start';
  return raw;
}

export default function Login() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      // A full page load, not a client-side route change: the cookie
      // was only just set, and the server needs to see it on a fresh
      // request before it will serve the protected page.
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
      style={{ background: C.paper, minHeight: '100vh', color: C.ink }}
    >
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
        <h1 className="text-2xl font-semibold leading-tight">
          เข้าใช้งานระบบผู้ช่วยร้าน
        </h1>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: C.muted }}>
          ใส่รหัสที่ผู้ติดตั้งให้ไว้ ใส่ครั้งเดียว
          เครื่องนี้จะจำไว้ 30 วัน
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm" style={{ color: C.muted }}>
              รหัสเข้าใช้งาน
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
              className="w-full rounded border bg-white px-3 py-2 text-base outline-none transition-colors focus:border-current"
              style={{ borderColor: C.rule, color: C.ink }}
            />
          </label>

          <button
            type="submit"
            disabled={busy || password.length === 0}
            className="w-full rounded px-6 py-3 text-base font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: C.ink }}
          >
            {busy ? 'กำลังตรวจสอบ…' : 'เข้าใช้งาน'}
          </button>

          {error && (
            <p className="text-sm" style={{ color: C.stamp }}>
              {error}
            </p>
          )}
        </form>

        <p
          className="mt-10 border-t pt-6 text-sm leading-relaxed"
          style={{ borderColor: C.rule, color: C.muted }}
        >
          ลืมรหัส? ติดต่อผู้ติดตั้งระบบ
          รหัสนี้ตั้งไว้ในระบบ ไม่ได้เก็บไว้ในหน้านี้
        </p>
      </div>
    </div>
  );
}