// app/dashboard/chats/page.tsx — แชท
//
// The conversations list. This is the screen that did not exist at all
// before: until the logging step, there was no way to see what the bot
// had said to anyone except by scrolling Instagram.
//
// Threads waiting on the owner come first, with the REASON the bot
// stopped shown verbatim — "asked for bank account", "frustrated
// tone". That reason is the whole value of the row. "Handed over"
// tells the owner nothing; "ขอเลขบัญชี" tells them what to do next.

import { listConversations, customerLabel } from '../../../lib/conversations';
import type { Conversation } from '../../../lib/conversations';
import { intentLabel } from '../../../lib/digest';
import { Section, Card, Row, RowList, Pill, Empty, whenLabel } from '../../../components/ui';
import { C } from '../theme';

export const dynamic = 'force-dynamic';

export default async function Chats() {
  const all = await listConversations(100).catch(() => [] as Conversation[]);

  const waiting = all.filter(c => c.handedOver);
  const rest = all.filter(c => !c.handedOver);

  return (
    <>
      {waiting.length > 0 && (
        <Section
          title={`รอคุณตอบ ${waiting.length} แชท`}
          caption="ผู้ช่วยหยุดตอบในแชทเหล่านี้แล้ว รอคุณเข้าไปคุยเอง"
        >
          <RowList>
            {waiting.map((c, i) => (
              <ChatRow key={c.id} c={c} first={i === 0} waiting />
            ))}
          </RowList>
        </Section>
      )}

      <Section title={waiting.length > 0 ? 'แชทอื่น' : 'แชท'}>
        {all.length === 0 ? (
          <Empty
            title="ยังไม่มีแชท"
            hint="พอลูกค้าทักเข้ามาใน Instagram บทสนทนาจะถูกบันทึกมาที่นี่ พร้อมเหตุผลที่ผู้ช่วยส่งต่อให้คุณ"
          />
        ) : rest.length === 0 ? (
          <Card>
            <p className="text-[13px]" style={{ color: C.ink2 }}>
              ทุกแชทรอคุณตอบอยู่ค่ะ
            </p>
          </Card>
        ) : (
          <RowList>
            {rest.map((c, i) => (
              <ChatRow key={c.id} c={c} first={i === 0} />
            ))}
          </RowList>
        )}
      </Section>

      <Card>
        <p className="text-[13px] leading-relaxed" style={{ color: C.ink2 }}>
          เก็บบทสนทนาไว้ 90 วัน แล้วลบทิ้งเองอัตโนมัติ —
          เป็นข้อความส่วนตัวของลูกค้า ไม่ได้เก็บไว้ตลอดไป
        </p>
      </Card>
    </>
  );
}

function ChatRow({
  c,
  first,
  waiting = false,
}: {
  c: Conversation;
  first: boolean;
  waiting?: boolean;
}) {
  return (
    <Row
      first={first}
      severity={waiting ? 'urgent' : undefined}
      href={`/dashboard/chats/${encodeURIComponent(c.customerId)}`}
      title={
        <span className="flex items-center gap-2">
          <span className="truncate">{customerLabel(c)}</span>
          {c.isVerified && <Pill tone="accent">ยืนยันแล้ว</Pill>}
        </span>
      }
      detail={
        waiting && c.handoverReason ? (
          <span style={{ color: C.urgent }} className="font-semibold">
            {c.handoverReason}
          </span>
        ) : c.lastIntent ? (
          intentLabel(c.lastIntent)
        ) : undefined
      }
      meta={
        c.customerUsername && c.customerName
          ? `@${c.customerUsername} · ${whenLabel(c.lastMessageAt)}`
          : whenLabel(c.lastMessageAt)
      }
    />
  );
}
