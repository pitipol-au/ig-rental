// lib/i18n.ts
//
// Thai and English, without an i18n library.
//
// ─────────────────────────────────────────────────────────────
// THIS FILE MUST STAY IMPORTABLE FROM A CLIENT COMPONENT
//
// So it contains no next/headers, no cookies(), nothing server-only.
// The cookie reader lives in lib/i18n-server.ts instead.
//
// The reason is a Next.js rule that is easy to trip: bundling works
// per MODULE, not per export. A client component importing pick()
// from here would drag the whole file into the browser bundle — and
// if cookies() were in it, the build fails with "you're importing a
// component that needs next/headers". Splitting is the fix; there is
// no way to import just the safe half.
// ─────────────────────────────────────────────────────────────
//
// ─────────────────────────────────────────────────────────────
// WHY NOT next-intl OR /th AND /en ROUTES
//
// The usual setup is a translation library plus a locale segment in
// the URL, and a JSON file of keys like "dashboard.actions.title".
// For two languages and one shop that buys you very little and costs
// a lot:
//
//   - a new dependency and a restructured app/ directory
//   - a key namespace to invent, then keep in sync across two files
//   - missing keys that fail silently and ship "dashboard.actions.
//     title" to a real customer's screen
//
// Instead: t('ที่ต้องทำ', 'To do'). Both languages sit at the point of
// use, so nothing can go missing, nothing needs naming, and the Thai
// stays readable in the middle of the markup where you can see what
// the screen actually says.
//
// The honest trade-off: strings are scattered across files rather than
// collected in one. That is the right call for two languages and the
// wrong one for twenty. If a third language ever appears, this is the
// moment to switch to a real library — and every call site is already
// a one-line change.
// ─────────────────────────────────────────────────────────────

export type Locale = 'th' | 'en';

/** Not httpOnly on purpose: it is a display preference, the toggle
 *  sets it straight from the browser, and there is nothing secret in
 *  knowing someone reads English. */
export const LOCALE_COOKIE = 'ui_lang';

/** Thai by default — the shop owner is Thai. English is the guest. */
export const DEFAULT_LOCALE: Locale = 'th';

/** Picks a string. Use in client components, where the locale arrives
 *  as a prop rather than from a cookie. */
export function pick(locale: Locale) {
  return (th: string, en: string): string => (locale === 'en' ? en : th);
}

/* ─────────────────────────────────────────────────────────────
   Shared vocabulary

   Only for words that appear on more than one screen, or that come
   out of the database as a code rather than as text. Everything else
   stays inline at its call site.
   ───────────────────────────────────────────────────────────── */

/** What analyze() decided a message was about. */
const INTENT: Record<string, [string, string]> = {
  question: ['ถามข้อมูลสินค้า', 'Product question'],
  confirm_order: ['ยืนยันสั่งซื้อ', 'Confirming an order'],
  payment: ['เรื่องการชำระเงิน', 'Payment'],
  human_request: ['ขอคุยกับแอดมิน', 'Asked for a person'],
  complaint: ['ร้องเรียน', 'Complaint'],
  uncovered: ['เรื่องที่ข้อมูลไม่ครอบคลุม', 'Not covered by the catalogue'],
  other: ['ทักทาย/อื่นๆ', 'Greeting / other'],
};

export function intentLabel(intent: string, locale: Locale): string {
  const pair = INTENT[intent];
  return pair ? (locale === 'en' ? pair[1] : pair[0]) : intent;
}

/** What the customer asked for and the shop could not supply —
 *  analyze()'s `missing` values, which are Thai codes in the data. */
const WANTED: Record<string, [string, string]> = {
  'ไซส์ไม่ถูกต้อง': ['ขอไซส์ที่ไม่มี', 'Wanted a size you do not have'],
  'สีไม่ถูกต้อง': ['ขอสีที่ไม่มี', 'Wanted a colour you do not have'],
  'สินค้าหมด': ['ขอสินค้าที่หมดแล้ว', 'Wanted something sold out'],
  'จำนวน': ['ยังไม่บอกจำนวน', 'Did not say how many'],
};

export function wantedLabel(code: string, locale: Locale): string {
  const pair = WANTED[code];
  return pair ? (locale === 'en' ? pair[1] : pair[0]) : code;
}

/** Order status, stored as a code. */
const STATUS: Record<string, [string, string]> = {
  pending_payment: ['รอชำระเงิน', 'Awaiting payment'],
  paid: ['จ่ายแล้ว', 'Paid'],
  shipped: ['ส่งแล้ว', 'Shipped'],
  cancelled: ['ยกเลิก', 'Cancelled'],
};

export function statusLabel(status: string, locale: Locale): string {
  const pair = STATUS[status];
  return pair ? (locale === 'en' ? pair[1] : pair[0]) : status;
}

/** Things the dashboard tells the owner to do. The reason these live
 *  here rather than in lib/digest.ts: digest.ts runs SQL and should
 *  not know what language anyone reads. It returns a `kind`; this
 *  turns the kind into words. */
const ACTION: Record<string, [string, string]> = {
  unpaid: [
    'ออเดอร์รอชำระเงินเกิน 2 วัน',
    'Orders unpaid for more than 2 days',
  ],
  waiting: [
    'แชทที่รอคุณตอบ ผู้ช่วยหยุดตอบไว้แล้ว',
    'Chats waiting for you — the assistant has stopped replying',
  ],
  no_price: [
    'สินค้าที่ยังไม่มีราคา ผู้ช่วยจะไม่รับออเดอร์ให้',
    'Products with no price — the assistant will not sell them',
  ],
  uncovered: [
    'คำถามที่ผู้ช่วยตอบไม่ได้ (7 วันที่ผ่านมา)',
    'Questions the assistant could not answer (last 7 days)',
  ],
  unsynced: [
    'โพสต์ใหม่ที่ยังไม่เข้าระบบ',
    'New Instagram posts not in the system yet',
  ],
};

export function actionLabel(kind: string, locale: Locale): string {
  const pair = ACTION[kind];
  return pair ? (locale === 'en' ? pair[1] : pair[0]) : kind;
}
