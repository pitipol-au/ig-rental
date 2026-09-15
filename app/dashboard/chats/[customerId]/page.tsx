// app/dashboard/chats/[customerId]/page.tsx
//
// One conversation, read as a chat.
//
// Three roles, three visual treatments, because the distinction is the
// point of the screen:
//
//   customer  left, plain surface     — what they said
//   bot       right, jade tint        — what the assistant said
//   human     right, plain + label    — what YOU said in Instagram
//
// Separating bot from human is what lets an owner see how much the
// assistant actually handled for them. If every reply looked the
// same, the transcript would read as though the bot did everything,
// and the one number that justifies paying for this would be
// invisible.
//
// Customer messages also carry what analyze() decided — intent, and
// anything the shop could not supply. That is shown small and only
// where it exists, so the transcript still reads as a conversation.

import { getThread, customerLabel } from '../../../../lib/conversations';
import { intentLabel } from '../../../../lib/digest';
import { Card, Pill, Empty, whenLabel } from '../../../../components/ui';
import { C, R } from '../../theme';

export const dynamic = 'force-dynamic';

const WANTED_TH: Record<string, string> = {
  'ไซส์ไม่ถูกต้อง': 'ขอไซส์ที่ไม่มี',
  'สีไม่ถูกต้อง': 'ขอสีที่ไม่มี',
  'สินค้าหมด': 'ของหมด',
  'จำนวน': 'ไม่บอกจำนวน',
};

export default async function Thread({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const thread = await getThread(decodeURIComponent(customerId)).catch(() => null);

  if (!thread) {
    return (
      <Empty
        title="ไม่พบแชทนี้"
        hint="อาจถูกลบไปแล้วตามกำหนด 90 วัน หรือลูกค้าคนนี้ยังไม่เคยทักเข้ามา"
      />
    );
  }

  const { conversation: c, messages } = thread;

  return (
    <>
      {/* ── Who ─────────────────────────────────────────────── */}
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
                  `${c.followerCount.toLocaleString('th-TH')} ผู้ติดตาม`,
                c.lang === 'en' ? 'คุยภาษาอังกฤษ' : 'คุยภาษาไทย',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>

        {c.handedOver && (
          <div
            className="mt-3 px-3 py-2.5"
            style={{ background: C.urgentTint, borderRadius: R.chip }}
          >
            <p className="text-[13px] font-semibold" style={{ color: C.urgent }}>
              ผู้ช่วยหยุดตอบแชทนี้แล้ว
            </p>
            {c.handoverReason && (
              <p className="mt-0.5 text-[12.5px]" style={{ color: C.ink2 }}>
                เหตุผล: {c.handoverReason}
              </p>
            )}
            <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: C.ink2 }}>
              ให้ผู้ช่วยกลับมาตอบ: พิมพ์ข้อความขึ้นต้นด้วย /bot ใน Instagram
              หรือรอ 24 ชั่วโมง
            </p>
          </div>
        )}
      </Card>

      {/* ── The conversation ────────────────────────────────── */}
      {messages.length === 0 ? (
        <Empty
          title="ยังไม่มีข้อความที่บันทึกไว้"
          hint="ระบบเริ่มเก็บบทสนทนาตั้งแต่ที่ติดตั้งฟีเจอร์นี้ ข้อความก่อนหน้านั้นจะไม่มี"
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {messages.map(m => {
            const mine = m.role !== 'customer';
            const isBot = m.role === 'bot';

            return (
              <div
                key={m.id}
                className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
              >
                <div
                  className="max-w-[86%] px-3.5 py-2.5"
                  style={{
                    background: isBot ? C.accentSoft : C.surface,
                    border: `1px solid ${isBot ? C.accentSoft : C.line}`,
                    borderRadius: R.card,
                    // Squared-off corner on the speaker's side, so the
                    // bubble points at who said it.
                    borderBottomRightRadius: mine ? 4 : R.card,
                    borderBottomLeftRadius: mine ? R.card : 4,
                  }}
                >
                  <p className="whitespace-pre-wrap text-[14px] leading-relaxed">
                    {m.text || (m.imageKind ? `[รูป — ${m.imageKind}]` : '—')}
                  </p>

                  {m.imageUrl && (
                    <p className="mt-1 text-[11.5px]" style={{ color: C.ink3 }}>
                      {/* Meta's CDN links expire, so this is honest about
                          being a link that may be dead rather than a
                          broken image. */}
                      <a
                        href={m.imageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2"
                      >
                        เปิดรูปที่แนบมา
                      </a>
                      {' '}(ลิงก์จาก Instagram หมดอายุได้)
                    </p>
                  )}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-1.5 px-1">
                  <span className="text-[11px]" style={{ color: C.ink3 }}>
                    {m.role === 'human' ? 'คุณตอบเอง' : isBot ? 'ผู้ช่วย' : ''}
                    {m.role !== 'customer' ? ' · ' : ''}
                    {whenLabel(m.createdAt)}
                  </span>

                  {m.intent && <Pill>{intentLabel(m.intent)}</Pill>}
                  {m.tier === 3 && <Pill tone="urgent">ส่งต่อให้คุณ</Pill>}
                  {m.tier === 2 && <Pill tone="warn">ข้อมูลไม่ครอบคลุม</Pill>}
                  {(m.missing ?? []).map(w => (
                    <Pill key={w} tone="warn">
                      {WANTED_TH[w] ?? w}
                    </Pill>
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
        ← กลับไปรายการแชท
      </a>
    </>
  );
}
