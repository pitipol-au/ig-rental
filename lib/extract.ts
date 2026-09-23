// lib/extract.ts
//
// One call that classifies the message AND extracts the booking.
//
// Replaced keyword trigger lists, which could never be both loose
// enough to catch real intent and tight enough to avoid false matches,
// in two languages. Every attempt proved it:
//
//   สี      matched inside unrelated Thai words
//   ครับ    matched inside สวัสดีครับ
//   account matched "what's this account for?"
//   ok      matched inside "book"
//
// The tier system comes from a colleague's prompt design, with one
// change: tiers are returned as STRUCTURED DATA, never appended to
// the reply text. The original design had the model write
// "[SYSTEM NOTE: Tier 3 triggered]" into its answer — which would
// send internal telemetry straight to the customer.
//
// ─────────────────────────────────────────────────────────────
// RETAIL -> RENTAL: WHAT CHANGED HERE
//
// A retail order needed a quantity. A rental booking needs a DATE
// RANGE, and that date range is the whole point of the product: two
// customers can each buy their own shirt, but they cannot each rent
// the SAME dress for overlapping dates. So:
//
//   - "qty" is no longer the thing the customer must state; pickup
//     and return dates are, once per booking (not per item).
//   - Every item's price is still looked up from the product row
//     (never trusted from the model), and so is its deposit.
//   - A NEW check exists that retail never needed: even a fully valid
//     item, at a fully valid price, can still be unconfirmable because
//     someone else already has it booked for those dates. That check
//     needs a database read (lib/orders.ts:isAvailable), so it can't
//     live in the synchronous recompute() the way price/colour/size
//     checks do — see checkAvailability() below.
// ─────────────────────────────────────────────────────────────

import { getHistory } from './memory';
import { getProducts, formatCatalog } from './catalog';
import { getShippingCost } from './shop';
import { isAvailable } from './orders';
import { shopDay } from './conversations';
import type { Product } from './catalog';

const API_URL = 'https://api.opentyphoon.ai/v1/chat/completions';
const MODEL = process.env.TYPHOON_MODEL ?? 'typhoon-v2.5-30b-a3b-instruct';

/** Matches the booking-summary heading lib/ai.ts is instructed to use
 *  (Thai or English). Same idea as IS_SUMMARY in lib/ai.ts. */
const SUMMARY_SHOWN = /สรุปการจอง|booking summary/i;

export type Intent =
  | 'question'        // browsing, asking about products or the shop
  | 'confirm_order'   // agreeing to a summarised booking
  | 'payment'         // asking how to pay, or claiming to have paid
  | 'human_request'   // explicitly wants a person
  | 'complaint'       // frustrated, unhappy, cancelling
  | 'uncovered'       // customisation or logistics not in the catalog
  | 'other';

/**
 * 1 = bot handles it
 * 2 = bot keeps helping, seller gets notified (soft handoff)
 * 3 = bot stops, human takes over (hard cutoff)
 */
export type Tier = 1 | 2 | 3;

export type OrderItem = {
  title: string;
  color: string;
  size: string;
  qty: number;
  price: number;
  deposit: number;
};

export type Analysis = {
  intent: Intent;
  tier: Tier;
  tierReason: string;
  confirmed: boolean;
  items: OrderItem[];
  /** 'YYYY-MM-DD', or '' if not yet stated. One range for the whole
   *  booking — see the note above. */
  startDate: string;
  endDate: string;
  subtotal: number;
  shipping: number;
  depositTotal: number;
  total: number;
  missing: string[];
};

/** Built per call: shipping is a live value, and "today" has to be
 *  the actual day so the model can resolve "พรุ่งนี้" / "เสาร์หน้า". */
function buildPrompt(shipping: number, today: string): string {
  return `You analyse conversations for a clothing RENTAL shop. You are not a chatbot.
Read the conversation and reply with JSON only. No other text.

TODAY'S DATE: ${today} (Asia/Bangkok). Resolve any relative date the
customer gives ("พรุ่งนี้", "เสาร์นี้", "วันที่ 5") against this date.

=== INTENT (judge the customer's LATEST message) ===

"question"      = asking about products, prices, deposits, availability,
                  or general shop questions, including "what is this
                  account for"
"confirm_order" = agreeing to a booking the shop has already summarised.
                  Requires a prior summary.
"payment"       = asking how to pay, requesting an account number or QR,
                  or saying they have transferred
"human_request" = explicitly asking to speak to a person
"complaint"     = frustrated, dissatisfied, complaining about service,
                  or cancelling
"uncovered"     = asking for customisation, or a logistics detail the
                  product information does not cover, asked in a
                  neutral tone
"other"         = greetings, small talk, anything else

CRITICAL:
- "ครับ" and "ค่ะ" are politeness particles, NOT confirmations.
  "สวัสดีครับ" is "other", not "confirm_order".
- "บัญชี" / "account" may mean an Instagram account, not a bank account.
  "What's this account for?" is "question", not "payment".
- Judge the meaning of the whole sentence. Never match on single words.
- Judge complaints by TONE and MEANING, not by keyword.
  "พอแล้วค่ะ ขอบคุณ" is a polite ending, not a complaint.
  "พอแล้ว! ตอบช้ามาก" is a complaint.
- The conversation may be in Thai or English.

=== TIER ===

tier 1 = intent is question, confirm_order, or other.
         The bot handles it.
tier 2 = intent is uncovered.
         The bot keeps helping with what it knows; the seller is
         notified in the background.
tier 3 = intent is payment, human_request, or complaint.
         The bot stops and a human takes over.

tierReason = a short phrase in English explaining the trigger,
             e.g. "asked for bank account", "frustrated tone",
             "custom alteration request"

=== BOOKING EXTRACTION ===

- confirmed = true only when intent is "confirm_order" or "payment",
  AND the shop has already summarised the booking, AND the customer
  agreed.
- If the shop has not summarised yet, confirmed = false always.
- Use prices from the product information only. If a product shows
  "ค่าเช่าที่ถูกต้อง", use that number.
- Never calculate a price yourself. If unknown, use 0.
- title must be the Thai product name, even in an English conversation.
- qty is how many of that SAME item the customer is renting at once
  (e.g. two of the same dress for a group). Default to 1 unless they
  clearly said otherwise.
- items must reflect EVERY choice from the WHOLE conversation, not
  only the latest message. If the customer chose a product and colour
  two messages ago and this message only adds a date or a size, KEEP
  the product and colour in items — do not drop a field to blank just
  because this message did not repeat it.

VALIDATION BEFORE CONFIRMING:
- size must match that product's "ไซส์ที่มีจริงทั้งหมด".
  If not, confirmed = false and add "ไซส์ไม่ถูกต้อง" to missing.
- color must match that product's "สีที่มีจริงทั้งหมด".
  If not, confirmed = false and add "สีไม่ถูกต้อง" to missing.
- If the product is marked "สินค้าหมด", confirmed = false and add
  "สินค้าหมด" to missing.

RENTAL DATES (pickupDate, returnDate):
- One date range for the WHOLE booking, not per item.
- Format 'YYYY-MM-DD', resolved against today's date above.
- returnDate must be a real date after pickupDate.
- If either date is missing or unclear, confirmed = false and add
  "วันที่เช่า" to missing.
- A date is never taken from a size name or a price. "2XL" is a size,
  not a day.

=== FORMAT ===
{"intent":"question","tier":1,"tierReason":"","confirmed":false,"items":[],"pickupDate":"","returnDate":"","subtotal":0,"shipping":${shipping},"depositTotal":0,"total":0,"missing":[]}`;
}

export async function analyze(
  senderId: string,
  latestText: string
): Promise<Analysis | null> {
  // Shipping and the catalog are read alongside history, so all three
  // come from the same moment. The raw product rows are kept (not just
  // the formatted text) so recompute() can check the model's booking
  // against real colours, sizes, stock, price and deposit — the same
  // data the prompt saw, checked again in code instead of trusted
  // from the model's JSON.
  const [history, products, shipping] = await Promise.all([
    getHistory(senderId),
    getProducts(),
    getShippingCost(),
  ]);
  const catalogText = formatCatalog(products);
  const today = shopDay();

  const transcript = [
    ...history.map(t => `${t.role === 'user' ? 'Customer' : 'Shop'}: ${t.text}`),
    `Customer (latest message): ${latestText}`,
  ].join('\n');

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.TYPHOON_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `${buildPrompt(shipping, today)}\n\nPRODUCTS:\n${catalogText}`,
          },
          { role: 'user', content: transcript },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 800,
      }),
    });

    if (!res.ok) throw new Error(`Typhoon ${res.status}`);

    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
    let result = recompute(parsed, shipping, products, today);

    // The prompt says "confirmed only after the shop has summarised
    // and the customer agreed", but a prompt instruction is not a
    // guarantee: in testing, simply answering the last missing
    // question (e.g. stating the return date) was enough to make the
    // model set confirmed = true and intent = "confirm_order", with
    // no summary ever having been shown. That would silently create a
    // booking the customer never actually saw or agreed to — checked
    // again here in code, the same way price/colour/size already are.
    if (result.confirmed && !history.some(t => t.role === 'model' && SUMMARY_SHOWN.test(t.text))) {
      result = { ...result, confirmed: false };
    }

    // The one check recompute() cannot do on its own: does anyone
    // else already have this item for these dates. Only worth asking
    // the database once everything else about the booking checks out.
    if (result.confirmed) {
      return await checkAvailability(result);
    }
    return result;
  } catch (err) {
    console.error('Analysis failed:', err);
    return null;
  }
}

/**
 * The rental-calendar check. Runs after recompute() has already
 * confirmed the items are real, in stock, and correctly priced — this
 * only asks "is anyone else already renting this for these dates".
 */
async function checkAvailability(result: Analysis): Promise<Analysis> {
  const conflicts: string[] = [];

  for (const item of result.items) {
    const free = await isAvailable(item.title, result.startDate, result.endDate);
    if (!free) conflicts.push(`ช่วงวันที่ไม่ว่าง: ${item.title}`);
  }

  if (conflicts.length === 0) return result;

  return {
    ...result,
    confirmed: false,
    missing: [...result.missing, ...conflicts],
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Totals computed in code, never trusted from the model.
 *
 * An earlier build double-counted shipping and quoted 1,260 instead
 * of 1,220. items.reduce() does not make that mistake.
 */
function recompute(raw: any, shipping: number, products: Product[], today: string): Analysis {
  type RawItem = { title?: string; color?: string; size?: string; qty?: number };
  const items: OrderItem[] = ((raw.items ?? []) as RawItem[])
    .filter((i): i is RawItem & { title: string } => Boolean(i?.title))
    .map(i => ({
      title: i.title,
      color: i.color ?? '',
      size: i.size ?? '',
      qty: Number(i.qty) > 0 ? Number(i.qty) : 1,
      price: 0,
      deposit: 0,
    }));

  // The prompt asks the model to check colour/size/stock itself
  // ("VALIDATION BEFORE CONFIRMING" in buildPrompt), but a prompt
  // instruction is not a guarantee — it is what let 300 scarves get
  // saved in "เขียวมิ้นท์", a colour that only ever existed on a
  // different product. Every item is checked again here, against the
  // same product rows the prompt was built from, and price/deposit are
  // taken from the product row rather than trusted from the model at
  // all.
  const invalidReasons: string[] = [];
  for (const item of items) {
    const product = products.find(p => p.title === item.title);

    if (!product) {
      invalidReasons.push(`ไม่พบสินค้า: ${item.title}`);
      continue;
    }
    if (!product.inStock) {
      invalidReasons.push('สินค้าหมด');
    }
    if (product.colors.length > 0 && !product.colors.includes(item.color)) {
      invalidReasons.push('สีไม่ถูกต้อง');
    }
    if (product.sizes.length > 0 && !product.sizes.includes(item.size)) {
      invalidReasons.push('ไซส์ไม่ถูกต้อง');
    }
    // null means the shop has not decided this yet — 0 is a valid,
    // explicit "no deposit charged" and is not the same thing. Both
    // must be set before the bot can book the item, same rule as price.
    if (product.deposit === null) {
      invalidReasons.push('ยังไม่ได้ตั้งค่ามัดจำ');
    }
    item.price = product.price ?? 0;
    item.deposit = product.deposit ?? 0;
  }

  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const depositTotal = items.reduce((sum, i) => sum + i.deposit * i.qty, 0);

  const validIntents: Intent[] = [
    'question', 'confirm_order', 'payment',
    'human_request', 'complaint', 'uncovered', 'other',
  ];
  const intent: Intent = validIntents.includes(raw.intent)
    ? raw.intent
    : 'question';   // safest default — keeps the bot talking

  // Derive the tier from intent rather than trusting the model's own
  // tier field. Intent is a simpler judgement and less likely to drift.
  const tier: Tier =
    intent === 'payment' || intent === 'human_request' || intent === 'complaint'
      ? 3
      : intent === 'uncovered'
      ? 2
      : 1;

  // A deposit of 0 is a valid, explicit shop setting (see
  // lib/catalog.ts) — what's NOT valid is a price of 0, which means no
  // price was ever set. Writing that to the database would create a
  // free rental.
  const priced = items.every(i => i.price > 0);

  const startDate = typeof raw.pickupDate === 'string' && DATE.test(raw.pickupDate) ? raw.pickupDate : '';
  const endDate = typeof raw.returnDate === 'string' && DATE.test(raw.returnDate) ? raw.returnDate : '';
  const datesValid = startDate !== '' && endDate !== '' && endDate > startDate && startDate >= today;

  const missing: string[] = [...(raw.missing ?? []), ...invalidReasons];
  if (!datesValid && !missing.includes('วันที่เช่า')) missing.push('วันที่เช่า');

  return {
    intent,
    tier,
    tierReason: String(raw.tierReason ?? '').slice(0, 120),
    confirmed:
      Boolean(raw.confirmed) &&
      priced &&
      items.length > 0 &&
      invalidReasons.length === 0 &&
      datesValid,
    items,
    startDate,
    endDate,
    subtotal,
    shipping,
    depositTotal,
    total: subtotal + shipping + depositTotal,
    missing,
  };
}
