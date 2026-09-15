// app/dashboard/chats/[customerId]/page.tsx
//
// One conversation, read as a chat.
//
// Three roles, three treatments, because the distinction is the point
// of the screen:
//
//   customer  left, plain surface     — what they said
//   bot       right, jade tint        — what the assistant said
//   human     right, plain + label    — what YOU said in Instagram
//
// If bot and human replies looked the same, the transcript would read
// as though the assistant did everything, and the one number that
// justifies paying for this would be invisible.

import { getThread, customerLabel } from '../../../../lib/conversations';
import { getLocale, tr } from '../../../../lib/i18n-server';
import { intentLabel, wantedLabel } from '../../../../lib/i18n';
import { Card, Pill, Empty, whenLabel } from '../../../../components/ui';
import { C, R } from '../../theme';
import ReleaseButton from './ReleaseButton';

export const dynamic = 'force-dynamic';

export default async function Thread({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const [locale, t] = await Promise.all([getLocale(), tr()]);
  const thread = await getThread(decodeURIComponent(customerId)).catch(() => null);

  if (!thread) {
    return (
      <Empty
        title={t('ไม่พบแชทนี้', 'Chat not found')}
        hint={t(
          'อาจถูกลบไปแล้วตามกำหนด 90 วัน หรือลูกค้าคนนี้ยังไม่เคยทักเข้ามา',
          'It may have aged out of the 90-day window, or this customer has never messaged.'
        )}
      />
    );
  }

  const { conversation: c, messages } = thread;
  const replyHref = c.customerUsername
    ? `https://ig.me/m/${c.customerUsername}`
    : 'https://www.instagram.com/direct/inbox/';

  return (
    <>
      {/* ── Who, and how to answer them ─────────────────────── */}
      <Card>
        <div className="flex items-center gap-3">
          {c.customerProfilePic ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.customerProfilePic}
              alt=""
              width={44}
              height={44}
              className="h-11 w-11 flex-none rounded-full object-cover"
              style={{ background: C.ground }}
            />
          ) : (
            <div
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-[15px] font-bold"
              style={{ background: C.accentSoft, color: C.accent }}
            >
              {customerLabel(c).slice(0, 1).toUpperCase()}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold leading-tight">
              {customerLabel(c)}
            </p>
            <p className="truncate text-[12.5px] leading-tight" style={{ color: C.ink3 }}>
              {[
                c.customerUsername && `@${c.customerUsername}`,
                typeof c.followerCount === 'number' &&
                  t(
                    `${c.followerCount.toLocaleString('th-TH')} ผู้ติดตาม`,
                    `${c.followerCount.toLocaleString('en-GB')} followers`
                  ),
                c.lang === 'en'
                  ? t('คุยภาษาอังกฤษ', 'Speaks English')
                  : t('คุยภาษาไทย', 'Speaks Thai'),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>

        {/* The reply button, prominent: this screen exists so the
            owner can see what happened and then answer. */}
        <a
          href={replyHref}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex min-h-[48px] w-full items-center justify-center text-[15px] font-bold text-white active:opacity-70"
          style={{ background: C.accent, borderRadius: R.chip }}
        >
          {c.customerUsername
            ? t('ตอบใน Instagram ↗', 'Reply in Instagram ↗')
            : t('เปิดกล่องข้อความ Instagram ↗', 'Open Instagram inbox ↗')}
        </a>

        {!c.customerUsername && (
          <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: C.ink3 }}>
            {t(
              'ยังไม่รู้ชื่อผู้ใช้ของลูกค้าคนนี้ จึงเปิดได้แค่กล่องข้อความรวม',
              'This customer’s username is unknown, so this opens the inbox rather than the thread.'
            )}
          </p>
        )}

        {c.handedOver && (
          <div
            className="mt-3 px-3 py-2.5"
            style={{ background: C.urgentTint, borderRadius: R.chip }}
          >
            <p className="text-[13px] font-semibold" style={{ color: C.urgent }}>
              {t('ผู้ช่วยหยุดตอบแชทนี้แล้ว', 'The assistant has stopped replying here')}
            </p>
            {c.handoverReason && (
              <p className="mt-0.5 text-[12.5px]" style={{ color: C.ink2 }}>
                {t('เหตุผล: ', 'Reason: ')}{c.handoverReason}
              </p>
            )}
            <div className="mt-2.5">
              <ReleaseButton customerId={c.customerId} locale={locale} />
            </div>
            <p className="mt-2 text-[12px] leading-relaxed" style={{ color: C.ink3 }}>
              {t(
                'กดปุ่มนี้แล้วลูกค้าจะไม่เห็นอะไรเลย ต่างจากการพิมพ์ /bot ในแชทที่ลูกค้าเห็นด้วย',
                'Pressing this shows nothing to the customer — unlike typing /bot in the chat, which they can read.'
              )}
            </p>
          </div>
        )}
      </Card>

      {/* ── The conversation ────────────────────────────────── */}
      {messages.length === 0 ? (
        <Empty
          title={t('ยังไม่มีข้อความที่บันทึกไว้', 'No messages recorded yet')}
          hint={t(
            'ระบบเริ่มเก็บบทสนทนาตั้งแต่ที่ติดตั้งฟีเจอร์นี้ ข้อความก่อนหน้านั้นจะไม่มี',
            'Recording began when this feature was installed; anything earlier is not here.'
          )}
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {messages.map(m => {
            const mine = m.role !== 'customer';
            const isBot = m.role === 'bot';

            return (
              <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                <div
                  className="max-w-[86%] px-3.5 py-2.5"
                  style={{
                    background: isBot ? C.accentSoft : C.surface,
                    border: `1px solid ${isBot ? C.accentSoft : C.line}`,
                    borderRadius: R.card,
                    // Squared corner on the speaker's side, so the
                    // bubble points at who said it.
                    borderBottomRightRadius: mine ? 4 : R.card,
                    borderBottomLeftRadius: mine ? R.card : 4,
                  }}
                >
                  <p className="whitespace-pre-wrap text-[14px] leading-relaxed">
                    {m.text || (m.imageKind ? t(`[รูป — ${m.imageKind}]`, `[image — ${m.imageKind}]`) : '—')}
                  </p>

                  {m.imageUrl && (
                    <p className="mt-1 text-[11.5px]" style={{ color: C.ink3 }}>
                      <a
                        href={m.imageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2"
                      >
                        {t('เปิดรูปที่แนบมา', 'Open the attached image')}
                      </a>
                      {' '}
                      {/* Honest about being a link that may be dead,
                          rather than a broken image: Meta's CDN URLs
                          expire. */}
                      {t('(ลิงก์จาก Instagram หมดอายุได้)', '(Instagram links expire)')}
                    </p>
                  )}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-1.5 px-1">
                  <span className="text-[11px]" style={{ color: C.ink3 }}>
                    {m.role === 'human'
                      ? t('คุณตอบเอง', 'You replied')
                      : isBot
                      ? t('ผู้ช่วย', 'Assistant')
                      : ''}
                    {m.role !== 'customer' ? ' · ' : ''}
                    {whenLabel(m.createdAt)}
                  </span>

                  {m.intent && <Pill>{intentLabel(m.intent, locale)}</Pill>}
                  {m.tier === 3 && <Pill tone="urgent">{t('ส่งต่อให้คุณ', 'Handed to you')}</Pill>}
                  {m.tier === 2 && (
                    <Pill tone="warn">{t('ข้อมูลไม่ครอบคลุม', 'Not in the catalogue')}</Pill>
                  )}
                  {(m.missing ?? []).map(w => (
                    <Pill key={w} tone="warn">{wantedLabel(w, locale)}</Pill>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <a
        href="/dashboard/chats"
        className="pt-1 text-[13.5px] font-semibold"
        style={{ color: C.accent }}
      >
        {t('← กลับไปรายการแชท', '← Back to chats')}
      </a>
    </>
  );
}
