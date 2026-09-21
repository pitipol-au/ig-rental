// lib/ai.ts
//
// Conversation replies via Typhoon (SCB 10X), a Thai-specialised model.
// OpenAI-compatible API.
//
// Rules are in English so anyone maintaining this can read them.
// The language of the RULES is independent of the language of the
// REPLIES — Typhoon follows English instructions and answers in Thai.
//
// CHANGED IN THE MOVE TO POSTGRES: shipping comes from the shop row,
// not the SHIPPING_THB environment variable. See the note at the top
// of lib/extract.ts for the bug that fixes.
//
// ─────────────────────────────────────────────────────────────
// SIX FIXES, FROM FOUR BAD REPLIES
//
// A customer wrote "ผมต้องการชุดที่เหมาะกับเดตแรกครับ" — a man asking
// for a first-date outfit — and got a women's puff-sleeve dress, as
// an order summary listing all three colours ("ขาว/ดำ/ชมพู") and an
// assumed quantity of 1.
//
// 1. Thai marks the speaker's gender in the sentence itself. ผม and
//    ครับ mean a man is speaking. Nothing told the model to use that,
//    so it picked whatever looked most "first date".
//
// 2. A request for advice was treated as an order. The rules against
//    it existed ("never summarise until all four details are known",
//    "never assume a quantity") but sat far up a long prompt, and the
//    prominent summary TEMPLATE won. They are now stated as their own
//    section AND repeated in the final system message, which is the
//    position the model weighs most.
//
// 3. The prompt fix stopped the order summary, but the model STILL
//    suggested a crop top and a dress to the same man. "First date ->
//    cute dress" is a stronger association than a written rule.
//    So the decision moved into code, the way prices already did:
//    when a man is shopping for himself, women's items are removed
//    from the product list BEFORE the model sees it. It cannot
//    suggest what it is not shown. See shoppingForHimself() below.
//
// 4. "ผมอยากซื้อเดรสเป็นของขวัญให้แฟนครับ" got "สำหรับใส่เองหรือ
//    เป็นของขวัญคะ?" back. The prompt said "if he may be buying a gift,
//    ask" — and the model read "gift" as the cue to ask. The rule now
//    says never ask once they have said, and code tells the model
//    directly when a gift or partner has been mentioned.
//
// 5. The next reply opened "สำหรับของขวัญแฟนค่ะ" (as if the shop were
//    the girlfriend), padded a dress request with a shirt and a scarf
//    with no price, and ended on two questions. Now: products of the
//    type he named are the only ones sent for that reply (code), and
//    REPLY_SHAPE sets how a suggestion reads (prompt, sent last).
//
// 6. REPLY_SHAPE (fix 5) said "give name, colours, sizes and price"
//    for every product — so when the customer answered "สีชมพูครับ",
//    the whole product block came back with all three colours, plus
//    "อยากได้สีนี้เลยใช่ไหมคะ" asking him to confirm what he had just
//    said. Details are now for the FIRST suggestion only; after a
//    choice, the reply acknowledges it and asks for the next missing
//    detail (colour -> size -> quantity).
// ─────────────────────────────────────────────────────────────

import { getProducts, formatCatalog, type Product } from './catalog';
import { getShopConfig, formatShopInfo, formatTone } from './shop';
import { getHistory, addTurn, getLang } from './memory';
import { stripMarkdown } from './image';

const API_URL = 'https://api.opentyphoon.ai/v1/chat/completions';
const MODEL = process.env.TYPHOON_MODEL ?? 'typhoon-v2.5-30b-a3b-instruct';

const FALLBACK_TH = 'ขอโทษค่ะ ระบบขัดข้อง เดี๋ยวแอดมินมาตอบนะคะ';
const FALLBACK_EN = 'Sorry, something went wrong. Our admin will reply shortly.';

/**
 * Repeated at the very end of every request, because this is the
 * position the model weighs most. The same rules exist higher up in
 * the prompt — they were there when the first-date bug happened, and
 * the model skipped them anyway.
 */
const SUMMARY_GUARD =
  'Only write an order summary if the customer has chosen ONE product, ' +
  'ONE colour, a size (unless freesize) and a quantity themselves. ' +
  'If they asked for advice, suggest up to 3 products and ask which one. ' +
  'Match suggestions to who the customer is: ผม/ครับ means a man. ';

/** How a suggestion reply should read. Sent last, with the guard above,
 *  because the model follows the final instruction most closely.
 *  Each line fixes something a real reply got wrong. */
const REPLY_SHAPE =
  'Keep the reply short and natural, like a friendly shop admin chatting. ' +
  'Never repeat the customer\'s request back to them, and never write as if ' +
  'you were the person receiving it. Vary the opening; do not start every ' +
  'reply with "ได้เลยค่ะ". ' +
  'Mention ONLY products in the product list, each with its price. ' +
  'When you FIRST suggest a product, give its name, colours, sizes and price ' +
  'in a compact form. Do not copy labels such as NEW ARRIVAL or the shop\'s ' +
  'hype words (e.g. "มากกกก"). ' +
  'If the customer asked for a type of item, suggest only that type; do not add ' +
  'other kinds of product to fill space. ' +
  'ONCE THE CUSTOMER HAS PICKED something (a product, a colour, a size), do NOT ' +
  'list the product details again and do NOT ask them to confirm what they just ' +
  'said. Acknowledge it in a few words and ask for the NEXT missing detail only, ' +
  'in this order: product, colour, size (skip if freesize), quantity. ' +
  'Example: customer "สีชมพูครับ" -> "สีชมพูน่ารักมากเลยค่ะ รับกี่ตัวดีคะ". ' +
  'End with ONE question only. In Thai, a question ends with คะ, never ค่ะ. ';

/* ─────────────────────────────────────────────────────────────
   WHAT KIND OF ITEM DID THEY ASK FOR?

   "ผมอยากซื้อเดรสเป็นของขวัญให้แฟนครับ" got a dress, then a linen
   shirt, then a scarf with no price. He asked for a dress. Told to
   "suggest up to three", the model padded the list with whatever
   else was there.

   So when the LATEST message names a type of item and the shop has
   at least one, only those products are sent for this reply. The
   next message ("มีสีอะไรบ้าง", "มีอย่างอื่นไหม") gets the full list
   again, so nothing is hidden for good.

   Word lists, not AI: each type is the words a customer would use
   and the words that would appear in a product name.
   ───────────────────────────────────────────────────────────── */

const ITEM_TYPES: RegExp[] = [
  /เดรส|ชุดเดรส|dress/i,
  /กระโปรง|skirt/i,
  /เสื้อเชิ้ต|เชิ้ต|shirt/i,
  /เสื้อยืด|t-?shirt|\btee\b/i,
  /ครอป|crop/i,
  /กางเกง|pants|trousers|jeans|ยีนส์|shorts/i,
  /ผ้าพันคอ|scarf/i,
  /กระเป๋า|bag/i,
  /หมวก|\bhat\b|\bcap\b/i,
  /รองเท้า|shoe|sneaker|sandal/i,
  /เครื่องประดับ|สร้อย|ต่างหู|แหวน|กำไล|jewel|necklace|earring|\bring\b|bracelet/i,
];

/** Products matching the item type(s) named in this message, or null
 *  if the message names no type, or the shop has none of that type. */
function askedForType(message: string, products: Product[]): Product[] | null {
  const types = ITEM_TYPES.filter(t => t.test(message));
  if (types.length === 0) return null;
  const match = products.filter(p => types.some(t => t.test(p.title ?? '')));
  return match.length > 0 ? match : null;
}

/**
 * What one message looks like, on its own. No memory involved.
 *
 * Kept exported because the image handler uses it on a caption, and
 * because it is the honest primitive: chooseLang() below is what
 * decides, and it needs this as an input.
 */
export function detectLang(text: string): 'th' | 'en' {
  const thai = (text.match(/[\u0e00-\u0e7f]/g) ?? []).length;
  const latin = (text.match(/[a-zA-Z]/g) ?? []).length;
  if (thai > 0) return 'th';
  return latin > 0 ? 'en' : 'th';
}

/**
 * The language THIS REPLY should be in.
 *
 * ─────────────────────────────────────────────────────────────
 * THE RULE, AND WHY IT IS LOPSIDED
 *
 * The old design picked a language on first contact and locked it for
 * a week. That stopped "ok" from flipping a Thai thread to English,
 * and in exchange made switching impossible: a thread that got
 * classified as English answered in English no matter what the
 * customer typed. That is the bug this replaces.
 *
 * Re-detecting every message brings back the original problem, so the
 * rule is asymmetric — because the two signals are not equally
 * reliable:
 *
 *   Thai script present  -> Thai, always. Nobody types Thai by
 *                           accident. One Thai character is proof.
 *
 *   No Thai script       -> keep whatever the thread is already in,
 *                           UNLESS this message is substantial
 *                           English (3+ words). "ok", "yes", "M",
 *                           "1" and "L ka" leave a Thai thread alone;
 *                           "do you have this in size M" switches it.
 *
 * So the failure mode that remains is a Thai customer writing a full
 * English sentence and getting an English answer — which is the
 * correct answer to that message.
 * ─────────────────────────────────────────────────────────────
 */
export function chooseLang(text: string, current: 'th' | 'en' | null): 'th' | 'en' {
  const thai = (text.match(/[\u0e00-\u0e7f]/g) ?? []).length;
  if (thai > 0) return 'th';

  const latin = (text.match(/[a-zA-Z]/g) ?? []).length;

  // A number, an emoji, a sticker: no signal at all. Never let a
  // message with nothing in it change the language.
  if (latin === 0) return current ?? 'th';

  // First contact, and it is in Latin script.
  if (!current) return 'en';

  // Already English, still English.
  if (current === 'en') return 'en';

  // Thai thread, Latin message: only a real sentence switches it.
  const words = text.trim().split(/\s+/).filter(w => /[a-zA-Z]/.test(w)).length;
  return words >= 3 ? 'en' : 'th';
}

/* ─────────────────────────────────────────────────────────────
   Who is this customer shopping for?

   Thai marks the speaker's gender in the sentence: ครับ is only ever
   said by men, and ผม as "I" is male. That is a reliable enough
   signal to act on — but ONLY to hide women's items from a man
   shopping for himself. Everything below errs towards showing the
   full range, because hiding a product someone wanted is worse than
   showing one they didn't:

   - any female particle as well (ค่ะ, นะคะ, ดิฉัน)  -> unsure, show all
   - any sign it is for someone else (ให้แฟน, ของขวัญ) -> show all
   - he named a women's item himself (เดรส, กระโปรง)  -> show all;
     a man asking for a dress by name gets the dress

   Deliberately NOT "คับ" — it is also the word for "tight", and
   "ใส่แล้วคับไหม" (does it fit tight?) is an everyday clothing
   question from anyone.
   ───────────────────────────────────────────────────────────── */

const MALE = /ครับ|คร้าบ|ครัช|(^|\s)ผม(ต้องการ|อยาก|ขอ|จะ|ชอบ|ใส่|หา|ซื้อ|เป็น|มี|ไม่|ก็|ว่า|คิด|สนใจ)/;
const FEMALE = /ค่ะ|นะคะ|ดิฉัน|(^|\s)หนู(ต้องการ|อยาก|ขอ|จะ|ชอบ|ใส่|หา|ซื้อ)/;
const FOR_SOMEONE_ELSE =
  /ให้แฟน|ให้ภรรยา|ให้เมีย|ให้แม่|ให้น้อง|ให้พี่|ให้เพื่อน|ให้ลูก|ให้ยาย|ให้ป้า|ซื้อให้|ของขวัญ|ของฝาก|gift|girlfriend|wife|for (my|her)/i;

/** Judged from the product NAME only. Details are too loose — "wear it
 *  with a skirt" would mark a shirt as a women's item. */
const WOMENS_ITEM = /เดรส|กระโปรง|ครอป|สายเดี่ยว|เกาะอก|เบลาส์|บรา|บิกินี่|dress|skirt|crop|blouse|\bbra\b|bikini/i;

/** What the shop owner writes in a product's details overrides the
 *  name. Checked in this order, because "ทั้งผู้ชายและผู้หญิง" contains
 *  both words. */
const MARKED_FOR_ALL = /unisex|ยูนิเซ็กซ์|ทั้งชายและหญิง|ทั้งผู้ชายและผู้หญิง|ใส่ได้ทั้งชายหญิง|ผู้ชาย|for men|men's/i;
const MARKED_FOR_WOMEN = /ผู้หญิง|สำหรับสาว|women|ladies/i;

function isWomensItem(p: Product): boolean {
  const owner = `${p.details ?? ''} ${p.notes ?? ''}`;
  if (MARKED_FOR_ALL.test(owner)) return false;
  if (MARKED_FOR_WOMEN.test(owner)) return true;
  return WOMENS_ITEM.test(p.title ?? '');
}

/** True only when every signal agrees: a man, for himself. */
function shoppingForHimself(customerSaid: string[]): boolean {
  const all = customerSaid.join('\n');
  return (
    MALE.test(all) &&
    !FEMALE.test(all) &&
    !FOR_SOMEONE_ELSE.test(all) &&
    !WOMENS_ITEM.test(all)
  );
}

function buildSystemPrompt(
  catalogText: string,
  shopInfo: string,
  toneRule: string,
  shipping: number
): string {
  return `You are the admin of an online shop on Instagram.

SHOP INFO
${shopInfo}

TONE
${toneRule}

PRODUCTS IN STOCK
${catalogText}

=== SCOPE ===
- Only answer about this shop: products, prices, colours, sizes, stock,
  shipping, how to order, and order status.
- If asked anything unrelated (food, news, health, politics, horoscopes,
  coding, translation), politely decline in one short sentence and steer
  back to products.
- Never explain general knowledge, e.g. "what is stretch fabric",
  even if asked directly.
- Greetings are fine — greet back, then invite a product question.

=== GROUNDING (most important) ===
- The product information above is ALL the information that exists.
  There is nothing else.
- Never invent products, colours, sizes, prices, or fit details that
  are not explicitly written above.
- If a product shows "ราคาที่ถูกต้อง", use that number, not the price
  written in the caption.
- Never invent a price. If a product has no price, say you will check.
- Copy colours and sizes word for word. Never merge colour names from
  different products. Never create a new colour name.
- If the customer asks for a colour or size that is not listed, say
  plainly it is not available and state what is available.
  Never accept the order.
- FIT AND SIZING: only state fit advice such as "runs small", "true to
  size", or "oversized" if the product information says so explicitly.
  If it does not, say sizing details are not specified and suggest
  checking the size chart or asking the seller. NEVER infer fit from
  fabric type, product category, or general impression.
- Never state anything not written above: washing or care instructions,
  fabric composition, fibre percentages, country of origin, thickness,
  or stretch behaviour.
- When information is missing, say "ข้อมูลนี้ไม่ได้ระบุไว้ค่ะ
  เดี๋ยวแอดมินเช็คให้นะคะ" (or the English equivalent) and STOP.
  Do not guess and do not elaborate.
- If the customer says your information is wrong, re-read the product
  information and correct yourself. Never defend a mistake you made.

=== PHOTO REQUESTS ===
- A line in the history formatted as "[ลูกค้าส่งรูป: ...]" is a
  description of a photo the customer sent, produced by an image
  model. Treat it as the customer showing you an item.
- Compare that description against the products above and suggest the
  CLOSEST matches. Say plainly that these are similar items, not
  necessarily the exact one in the photo.
- Rank by garment type first, then colour, then style details.
- Suggest at most 3 products, with name and price.
- If nothing in the catalog is reasonably close, say so honestly and
  offer to have the admin check. Never force a bad match.
- Never claim a product IS the item in the photo.

=== SOLD-OUT FALLBACK ===
- If the requested colour or size is unavailable but the SAME product
  has other colours or sizes in stock, offer those instead of only
  saying "sold out".
  e.g. "สีขาวหมดแล้วค่ะ แต่ยังมีสีดำกับสีเทาอยู่นะคะ"
- If the whole product is marked "สินค้าหมด", never accept an order
  for it. You may mention other products only if the customer asks.

=== STATED PROMOTIONS ===
- If the product information mentions a promotion, bundle, or free
  shipping threshold, mention it once, naturally, when relevant —
  usually right after confirming a price.
- Never invent a promotion that is not written above.
- Mention each promotion only once per conversation.

=== WHO THE CUSTOMER IS SHOPPING FOR ===
- Thai marks who is speaking. "ผม" and "ครับ" mean the customer is a
  man. "ฉัน", "ดิฉัน", "หนู", "เค้า" with "ค่ะ" or "คะ" usually mean a
  woman. Use this whenever you suggest clothing or styling.
- This is about the CUSTOMER. The shop's own voice stays as set in
  TONE, whoever the customer is.
- Unless the product information says otherwise, treat dresses,
  skirts and blouses as women's items. Never suggest one to a man
  shopping for himself.
- Only call a product suitable for men, women or both if the product
  information says so, or it is clearly a women's item as above.
- If the customer has ALREADY said who it is for — "ของขวัญ",
  "ให้แฟน", "ให้แม่", "gift" — never ask again. Suggest items for
  that person straight away.
- Only if it is truly unclear who will wear it, ask ONE short
  question first, e.g. "สำหรับใส่เองหรือเป็นของขวัญคะ"
- If nothing in the catalogue suits who they are shopping for, say so
  plainly and offer to have the admin check. Never push an unsuitable
  item to fill the gap.

=== RECOMMENDING IS NOT ORDERING ===
- A request for advice is a recommendation, not an order:
  "แนะนำหน่อย", "มีอะไรเหมาะกับ...", "ใส่ไปเดตได้ไหม", "what should I wear".
  "ต้องการ" or "อยากได้" about a TYPE of item is also not choosing a
  product.
- For a recommendation: suggest 1 to 3 products with name and price,
  then ask which one they like. Stop there.
- NEVER answer a recommendation request with an order summary.
- An order summary may only follow the customer choosing, in their own
  messages: ONE specific product, ONE colour (if it has colours), a size
  (unless freesize), and a quantity.
- Each line of a summary has exactly ONE colour. Never write a list
  such as "ขาว/ดำ/ชมพู" as the colour — that means the customer has not
  chosen yet, so ask which one.

=== TONE ===
- Lightly mirror the customer's register.
  Formal or brief -> polite standard Thai with ค่ะ/นะคะ.
  Casual with slang or emoji -> warm and casual (จ้า/น้า), light emoji.
- Mirror TONE only. Never change facts to match the customer's mood.

=== CONVERSATION ===
- Collect all four before summarising: (1) product (2) colour
  (3) size (4) quantity.
- Before every reply, check the history for what is still missing.
- Ask only for what is missing. Never re-ask something already given.
- Freesize products: do not ask for size.
  Products with no colours listed: do not ask for colour.
- CAREFUL: size names can start with a number, e.g. 2XL, 3XL.
  That number is part of the size name, NOT a quantity.
- If the customer does not state a quantity, ask. Never assume one.
- Keep replies to 2-3 sentences, except when summarising an order.
- Never promise a specific timeframe such as "a few seconds" or
  "5 minutes". Say the admin will follow up.

=== ORDER SUMMARY — THAI (use this exact format) ===

  สรุปคำสั่งซื้อค่ะ
  • [สินค้า] [สี] ไซส์ [ไซส์] x[จำนวน] = [ราคา] x [จำนวน] = [ผลคูณ] บาท
  ค่าส่ง ${shipping} บาท
  ยอดรวมทั้งหมด [ผลคูณทุกรายการ + ${shipping}] บาท

  ยืนยันตามนี้ไหมคะ

=== ORDER SUMMARY — ENGLISH (use this exact format) ===

  Order summary
  • [product] [colour] size [size] x[qty] = [price] x [qty] = [subtotal] THB
  Shipping ${shipping} THB
  Total [subtotal + ${shipping}] THB

  Please confirm?

- "ยอดรวมทั้งหมด" / "Total" is the FINAL number and already includes
  shipping. Never add shipping twice.
- Always show the multiplication, e.g. 590 x 2 = 1180.
- Never summarise until all four details are known.
- Never mix two languages in one message.
- In an ENGLISH reply, write each product as the English name followed
  by the Thai name in brackets, e.g.
    Oversized Linen Shirt (เสื้อเชิ้ตโอเวอร์ไซส์ ผ้าลินิน)
  The customer needs the English to understand it and the Thai to
  match it against the Instagram post.
- In an ENGLISH reply, write prices as "890 THB", not "890 บาท".

=== AFTER THE CUSTOMER CONFIRMS ===
- Reply briefly, conveying (1) the order is received and (2) payment
  is the next step and the admin will send the details.
- Word it naturally. It does not have to be identical every time.
- Never say you will ship, prepare, or dispatch the order, and never
  thank them for their purchase, before they have paid.

=== MONEY (most important) ===
- Never give out a bank account number, PromptPay ID, or QR code.
- Never confirm that payment has been received.
- If the customer raises payment, say the admin will take over.

=== OUTPUT ===
- Output ONLY the message the customer should see.
- Never include system notes, tier labels, internal reasoning, or
  debugging markers in your reply. Those are handled elsewhere.

=== FORMATTING — this is an Instagram DM, PLAIN TEXT ONLY ===
- NEVER use markdown. No [text](url), no **bold**, no # headings,
  no tables. The customer sees the raw characters.
- Write links as a bare URL on its own line:
    https://www.instagram.com/p/XXXX/
- NEVER write internal labels such as "[สินค้าที่ 5]" or "[Product 3]".
  Those are catalog markers, not product names. Use the real name.`;
}

/** Backstop for artefacts the prompt doesn't reliably prevent. */
function clean(text: string): string {
  return stripMarkdown(
    text
      // Internal telemetry must never reach a customer.
      .replace(/\[SYSTEM NOTE:[^\]]*\]/gi, '')
      .replace(/\[Tier:[^\]]*\]/gi, '')
  );
}

export async function getAIReply(senderId: string, text: string): Promise<string> {
  // Reads, never writes. The webhook decides the language once per
  // message and stores it; this used to also call setLang with its
  // own detectLang result, which meant two places deciding and the
  // second one quietly winning.
  const lang = (await getLang(senderId)) ?? 'th';

  try {
    const [allProducts, shop] = await Promise.all([
      getProducts(),
      getShopConfig(),
    ]);
    const history = await getHistory(senderId);

    // Only what the CUSTOMER said. The shop's own replies are full of
    // ค่ะ, which would read as a woman speaking.
    const customerSaid = [
      ...history.filter(t => t.role === 'user').map(t => t.text),
      text,
    ];
    const forHimself = shoppingForHimself(customerSaid);
    const suitable = forHimself ? allProducts.filter(p => !isWomensItem(p)) : allProducts;
    const hidden = allProducts.length - suitable.length;
    // Narrow to the type named in THIS message, if the shop has it.
    const ofType = askedForType(text, suitable);
    const shown = ofType ?? suitable;
    if (ofType) {
      console.log(`[SHOPPER] ${senderId} — asked for a type; showing ${ofType.length} of ${suitable.length}`);
    }
    const catalogText = formatCatalog(shown);

    let shopperNote = '';
    const saidAll = customerSaid.join('\n');
    if (FOR_SOMEONE_ELSE.test(saidAll)) {
      // The customer already told us. Say so in the position the model
      // weighs most, or it asks "for yourself or a gift?" anyway.
      shopperNote =
        ' The customer has ALREADY said this is for someone else (a gift or a ' +
        'partner). Do NOT ask whether it is for himself or a gift. Suggest suitable ' +
        'products for that person, with prices, then ask ONE question — which ' +
        'colour, or their usual size.';
    } else if (hidden > 0 && suitable.length > 0) {
      shopperNote =
        ' The customer is a man shopping for himself, so women\'s items have been ' +
        'left out of the product list. If he says it is for someone else, ask who it is for.';
    } else if (hidden > 0) {
      shopperNote =
        ' Every product in this shop is a women\'s item, so none are listed. Tell him ' +
        'politely that the shop mainly carries women\'s styles, and ask whether he is ' +
        'shopping for someone else.';
    }
    if (hidden > 0) {
      console.log(`[SHOPPER] ${senderId} — man shopping for himself; hid ${hidden} women's item(s)`);
    }

    const messages = [
      {
        role: 'system',
        content: buildSystemPrompt(
          catalogText,
          formatShopInfo(shop),
          formatTone(shop),
          // Same shop row extract.ts computes the total from, so the
          // summary the customer reads and the total that gets saved
          // can no longer disagree.
          shop.shipping_cost
        ),
      },
      ...history.map(t => ({
        role: t.role === 'model' ? 'assistant' : 'user',
        content: t.text,
      })),
      { role: 'user', content: text },
      // Injected LAST, immediately before generation. A system message
      // here outweighs a rule buried higher up — Typhoon is
      // Thai-specialised and defaults to Thai otherwise.
      {
        role: 'system',
        content:
          lang === 'en'
            ? 'IMPORTANT: This conversation is in English. Reply in ENGLISH only. ' +
              'Use the English order summary format. Do not write Thai sentences. ' +
              'Thai product names may stay as they are. ' +
              SUMMARY_GUARD + REPLY_SHAPE + shopperNote
            : 'IMPORTANT: This conversation is in Thai. Reply in THAI only, ' +
              'using polite particles ค่ะ/นะคะ, never จ้ะ or จ๊ะ. Use the Thai order summary format. ' +
              SUMMARY_GUARD + REPLY_SHAPE + shopperNote,
      },
    ];

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.TYPHOON_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, messages, max_tokens: 600 }),
    });

    if (!res.ok) {
      throw new Error(`Typhoon ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }

    const data = await res.json();
    const reply = clean(data.choices?.[0]?.message?.content ?? '');
    if (!reply) throw new Error('empty reply');

    await addTurn(senderId, 'user', text);
    await addTurn(senderId, 'model', reply);

    return reply;
  } catch (err) {
    console.error('AI error:', err);
    return lang === 'en' ? FALLBACK_EN : FALLBACK_TH;
  }
}