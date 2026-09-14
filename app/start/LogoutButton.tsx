// app/start/LogoutButton.tsx
//
// Matches SyncButton: a client component, because the page itself is a
// server component and cannot run an onClick.
'use client';

import { useState } from 'react';

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    setBusy(true);
    try {
      await fetch('/api/login', { method: 'DELETE' });
    } catch {
      // Either way, send them to the login screen. If the cookie
      // survived, the login page is still the honest place to land.
    }
    window.location.href = '/login';
  };

  return (
    <button
      onClick={logout}
      disabled={busy}
      className="text-sm underline underline-offset-2 disabled:opacity-50"
      style={{ color: '#6B716A' }}
    >
      {busy ? 'กำลังออก…' : 'ออกจากระบบ'}
    </button>
  );
}