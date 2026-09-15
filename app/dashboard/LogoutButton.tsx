// app/dashboard/LogoutButton.tsx
//
// Replaces app/start/LogoutButton.tsx, which was styled for the old
// pages. That file can go once /start does.
'use client';

import { useState } from 'react';
import { C } from './theme';

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    setBusy(true);
    try {
      await fetch('/api/login', { method: 'DELETE' });
    } catch {
      // Either way, send them to the login screen. If the cookie
      // survived, that is still the honest place to land.
    }
    window.location.href = '/login';
  };

  return (
    <button
      onClick={logout}
      disabled={busy}
      className="min-h-[44px] px-4 text-[13.5px] font-medium active:opacity-60 disabled:opacity-50"
      style={{ color: C.ink3 }}
    >
      {busy ? 'กำลังออก…' : 'ออกจากระบบ'}
    </button>
  );
}
