// app/start/SyncButton.tsx
'use client';

import { useState } from 'react';

export default function SyncButton() {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  const run = async () => {
    setState('running');
    setMsg('');
    try {
      const res = await fetch('/api/sync');

      // A 404 or a crash returns an HTML error page, not JSON.
      // Parsing it blindly shows the shop owner a JavaScript error.
      const body = await res.text();
      let data: any;
      try {
        data = JSON.parse(body);
      } catch {
        throw new Error(
          res.status === 404
            ? 'ไม่พบระบบดึงสินค้า กรุณาแจ้งผู้ติดตั้ง'
            : `ระบบขัดข้อง (${res.status}) กรุณาแจ้งผู้ติดตั้ง`
        );
      }
      if (!data.ok) throw new Error(data.error ?? 'ไม่สำเร็จ');

      setState('done');
      setMsg(
        data.added > 0
          ? `เพิ่มสินค้าใหม่ ${data.added} รายการ — อย่าลืมเติมสีกับไซส์ในตาราง`
          : 'ไม่มีโพสต์ใหม่ ทุกอย่างเป็นปัจจุบันแล้ว'
      );
      // Refresh so the status above reflects the new rows
      if (data.added > 0) setTimeout(() => location.reload(), 1800);
    } catch (err: any) {
      setState('error');
      setMsg(err.message);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={run}
        disabled={state === 'running'}
        className="rounded px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
        style={{ background: '#1A1D1A' }}
      >
        {state === 'running' ? 'กำลังดึง…' : 'ดึงสินค้าจาก Instagram'}
      </button>
      {msg && (
        <span
          className="text-sm"
          style={{ color: state === 'error' ? '#C8332E' : '#3F7A52' }}
        >
          {msg}
        </span>
      )}
    </div>
  );
}