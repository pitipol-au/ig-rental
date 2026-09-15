// app/dashboard/chats/page.tsx — แชท / Chats
//
// Threads waiting on the owner come first, with the REASON the bot
// stopped shown verbatim. That reason is the value of the row:
// "asked for bank account" tells the owner what to do next; "handed
// over" tells them nothing.
//
// Each row now carries a direct reply link straight into the
// Instagram conversation — see ReplyLink below for why it is built
// the way it is.

import { listConversations, customerLabel } from '../../../lib/conversations';
import type { Conversation } from '../../../lib/conversations';
import { getLocale, tr } from '../../../lib/i18n-server';
import { intentLabel, pick, type Locale } from '../../../lib/i18n';
import { Section, Card, Row, RowList, Pill, Empty, whenLabel } from '../../../components/ui';
import { C } from '../theme';

export const dynamic = 'force-dynamic';

export default async function Chats() {
  const [locale, t, all] = await Promise.all([
    getLocale(),
    tr(),
    listConversations(100).catch(() => [] as Conversation[]),
  ]);

  const waiting = all.filter(c => c.handedOver);
  const rest = all.filter(c => !c.handedOver);

  return (
    <>
      {waiting.length > 0 && (
        <Section
          title={t(`รอคุณตอบ ${waiting.length} แชท`, `${waiting.length} waiting for you`)}
          caption={t(
            'ผู้ช่วยหยุดตอบในแชทเหล่านี้แล้ว แตะ "ตอบใน IG" เพื่อเข้าไปคุยเอง',
            'The assistant has stopped replying in these. Tap "Reply in IG" to take over.'
          )}
        >
          <RowList>
            {waiting.map((c, i) => (
              <ChatRow key={c.id} c={c} first={i === 0} locale={locale} waiting />
            ))}
          </RowList>
        </Section>
      )}

      <Section title={waiting.length > 0 ? t('แชทอื่น', 'Other chats') : t('แชท', 'Chats')}>
        {all.length === 0 ? (
          <Empty
            title={t('ยังไม่มีแชท', 'No chats yet')}
            hint={t(
              'พอลูกค้าทักเข้ามาใน Instagram บทสนทนาจะถูกบันทึกมาที่นี่ พร้อมเหตุผลที่ผู้ช่วยส่งต่อให้คุณ',
              'When a customer messages on Instagram, the conversation is recorded here along with why the assistant handed it over.'
            )}
          />
        ) : rest.length === 0 ? (
          <Card>
            <p className="text-[13px]" style={{ color: C.ink2 }}>
              {t('ทุกแชทรอคุณตอบอยู่ค่ะ', 'Every chat is waiting for you')}
            </p>
          </Card>
        ) : (
          <RowList>
            {rest.map((c, i) => (
              <ChatRow key={c.id} c={c} first={i === 0} locale={locale} />
            ))}
          </RowList>
        )}
      </Section>

      <Card>
        <p className="text-[13px] leading-relaxed" style={{ color: C.ink2 }}>
          {t(
            'เก็บบทสนทนาไว้ 90 วัน แล้วลบทิ้งเองอัตโนมัติ — เป็นข้อความส่วนตัวของลูกค้า ไม่ได้เก็บไว้ตลอดไป',
            'Conversations are kept for 90 days and then deleted automatically. These are customers’ private messages, not a permanent archive.'
          )}
        </p>
      </Card>
    </>
  );
}

function ChatRow({
  c, first, locale, waiting = false,
}: {
  c: Conversation; first: boolean; locale: Locale; waiting?: boolean;
}) {
  const t = pick(locale);

  return (
    <div style={{ borderTop: first ? 'none' : `1px solid ${C.line}` }}>
      <Row
        first
        severity={waiting ? 'urgent' : undefined}
        href={`/dashboard/chats/${encodeURIComponent(c.customerId)}`}
        title={
          <span className="flex items-center gap-2">
            <span className="truncate">{customerLabel(c)}</span>
            {c.isVerified && <Pill tone="accent">{t('ยืนยันแล้ว', 'Verified')}</Pill>}
          </span>
        }
        detail={
          waiting && c.handoverReason ? (
            <span style={{ color: C.urgent }} className="font-semibold">
              {c.handoverReason}
            </span>
          ) : c.lastIntent ? (
            intentLabel(c.lastIntent, locale)
          ) : undefined
        }
        meta={
          c.customerUsername && c.customerName
            ? `@${c.customerUsername} · ${whenLabel(c.lastMessageAt)}`
            : whenLabel(c.lastMessageAt)
        }
      />

      {/* Outside the Row, because a link inside a link is invalid
          HTML and the browser resolves it by dropping one of them. */}
      <div
        className="flex justify-end px-4 pb-3"
        style={{ background: waiting ? C.urgentTint : undefined }}
      >
        <ReplyLink conversation={c} locale={locale} />
      </div>
    </div>
  );
}

/**
 * Straight into the Instagram conversation with this customer.
 *
 * ig.me/m/<username> is Instagram's own "message this account" link.
 * Opened while signed in as the shop, it lands on the thread with
 * that person — so the owner goes from "this chat needs me" to typing
 * a reply in one tap, instead of hunting through an inbox.
 *
 * It needs the username, which comes from the profile fetch and can
 * be missing: a customer who blocked the shop has no retrievable
 * profile. In that case this falls back to the inbox, which is one
 * extra tap rather than a dead button.
 */
function ReplyLink({
  conversation: c,
  locale,
}: {
  conversation: Conversation;
  locale: Locale;
}) {
  const t = pick(locale);
  const href = c.customerUsername
    ? `https://ig.me/m/${c.customerUsername}`
    : 'https://www.instagram.com/direct/inbox/';

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-[36px] items-center px-3 text-[12.5px] font-bold active:opacity-60"
      style={{ background: C.accent, color: '#FFFFFF', borderRadius: 8 }}
    >
      {c.customerUsername
        ? t('ตอบใน IG ↗', 'Reply in IG ↗')
        : t('เปิดกล่องข้อความ IG ↗', 'Open IG inbox ↗')}
    </a>
  );
}
