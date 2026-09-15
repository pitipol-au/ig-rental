// app/dashboard/chats/[customerId]/ReleaseButton.tsx
//
// Give the thread back to the bot, without the customer seeing it.
//
// The only way to do this used to be typing "/bot" into the Instagram
// conversation — which works, and which the CUSTOMER READS. Fine
// while testing; on a real shop the buyer watches the owner type a
// command at them.
//
// Confirms first, because it is not obviously reversible from the
// owner's point of view: the bot starts answering this customer again
// the moment it is pressed.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { C, R } from '../../theme';
import { pick, type Locale } from '../../../../lib/i18n';

export default function ReleaseButton({
  customerId,
  locale,
}: {
  customerId: string;
  locale: Locale;
}) {
  const t = pick(locale);
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'confirm' | 'busy' | 'error'>('idle');

  const release = async () => {
    setState('busy');
    try {
      const res = await fetch('/api/handover', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customerId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'failed');
      router.refresh();
      setState('idle');
    } catch {
      setState('error');
    }
  };

  if (state === 'confirm') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px]" style={{ color: C.ink2 }}>
          {t('ให้ผู้ช่วยตอบแชทนี้ต่อ?', 'Let the assistant answer this chat again?')}
        </span>
        <button
          onClick={release}
          className="min-h-[36px] px-3 text-[12.5px] font-bold text-white active:opacity-60"
          style={{ background: C.accent, borderRadius: R.chip }}
        >
          {t('ใช่', 'Yes')}
        </button>
        <button
          onClick={() => setState('idle')}
          className="min-h-[36px] px-3 text-[12.5px] font-semibold active:opacity-60"
          style={{ color: C.ink2 }}
        >
          {t('ยกเลิก', 'Cancel')}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setState('confirm')}
      disabled={state === 'busy'}
      className="min-h-[36px] px-3 text-[12.5px] font-bold active:opacity-60 disabled:opacity-50"
      style={{
        background: state === 'error' ? C.urgentTint : C.surface,
        color: state === 'error' ? C.urgent : C.accent,
        border: `1px solid ${state === 'error' ? C.urgentLine : C.accent}`,
        borderRadius: R.chip,
      }}
    >
      {state === 'busy'
        ? t('กำลังคืน…', 'Releasing…')
        : state === 'error'
        ? t('ไม่สำเร็จ ลองอีกครั้ง', 'Failed — try again')
        : t('ให้ผู้ช่วยตอบต่อ', 'Hand back to assistant')}
    </button>
  );
}
