// app/dashboard/products/SyncButton.tsx
//
// Pull new Instagram posts into the catalogue now, rather than waiting
// for the ten-minute background sync.
//
// Written fresh instead of reusing app/start/SyncButton.tsx: that one
// is styled for the old pages, and /start is going away once this
// dashboard replaces it.
//
// router.refresh() rather than location.reload(): the page is a server
// component, so refresh re-runs it on the server and swaps in the new
// HTML without throwing away scroll position or flashing white.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { C, R } from '../theme';

export default function SyncButton() {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [added, setAdded] = useState(0);

  const sync = async () => {
    setState('busy');
    try {
      const res = await fetch('/api/sync');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'sync failed');
      setAdded(data.added ?? 0);
      setState('done');
      router.refresh();
    } catch {
      setState('error');
    }
  };

  const label =
    state === 'busy'
      ? 'กำลังดึง…'
      : state === 'done'
      ? added > 0
        ? `เพิ่ม ${added} รายการ`
        : 'ไม่มีของใหม่'
      : state === 'error'
      ? 'ดึงไม่สำเร็จ'
      : 'ดึงสินค้า';

  return (
    <button
      onClick={sync}
      disabled={state === 'busy'}
      className="inline-flex min-h-[36px] items-center px-3.5 text-[13px] font-semibold active:opacity-60 disabled:opacity-50"
      style={{
        background: state === 'error' ? C.urgentTint : C.accentSoft,
        color: state === 'error' ? C.urgent : C.accent,
        borderRadius: R.chip,
      }}
    >
      {label}
    </button>
  );
}
