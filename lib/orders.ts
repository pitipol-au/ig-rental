// lib/orders.ts
//
// Confirmed orders. Previously a row appended to the Orders tab; now
// a row in Postgres, with the dashboard reading it instead of Sheets.
//
// What changed beyond storage:
//
// - subtotal and shipping are stored alongside the total, not just
//   the total. Recomputing an old order's shipping from today's
//   setting would rewrite history the moment the seller changes
//   their shipping fee.
//
// - items keeps its structure. The sheet flattened them to
//   "เสื้อ ขาว M x2 | กระโปรง ดำ L x1" because a cell holds text, so
//   nothing downstream could read back what was actually ordered.
//   The dashboard can now show a real line-item list.
//
// - The order number is still generated HERE, in code. Same rule as
//   the total: the model never produces a number a customer sees.

import { eq, and, desc, inArray, lte, gte } from 'drizzle-orm';
import { db, getShopId } from './db';
import { orders, ORDER_STATUSES, type Order, type OrderStatus, type OrderItemRow } from './db/schema';
import type { Analysis } from './extract';

export type { Order, OrderStatus };
export { ORDER_STATUSES };

/**
 * Write a confirmed order and return its number.
 *
 * The duplicate guard is NOT here — it is hasOrdered()/markOrdered()
 * in memory.ts, checked before this is called. That guard is in Redis
 * because SET NX is atomic across instances, which is what makes a
 * double order impossible even when Meta retries the same message.
 * A database check-then-insert would have a gap between the two.
 */
export async function saveOrder(
  customerId: string,
  order: Analysis
): Promise<string> {
  const shopId = await getShopId();
  const orderNo = `BK-${Date.now().toString(36).toUpperCase()}`;

  await db.insert(orders).values({
    shopId,
    orderNo,
    customerId,
    items: order.items.map(i => ({
      title: i.title,
      color: i.color,
      size: i.size,
      qty: i.qty,
      price: i.price,
      deposit: i.deposit,
    })),
    startDate: order.startDate,
    endDate: order.endDate,
    subtotal: order.subtotal,
    shipping: order.shipping,
    depositTotal: order.depositTotal,
    total: order.total,
    status: 'pending_deposit',
  });

  return orderNo;
}

/* ─────────────────────────────────────────────────────────────
   Availability — the actual "rental calendar" mechanic

   A rented item is not like stock: renting it to one customer for
   Jul 10-12 means it CANNOT also go to a second customer for Jul
   11-13, even though both bookings would show "in stock" if this
   only checked inStock the way the retail version did.
   ───────────────────────────────────────────────────────────── */

/** Bookings that still have the item out of the shop's hands, or
 *  waiting to go out. A cancelled booking never held the item; a
 *  returned one has given it back. Both leave every date free again. */
const ACTIVE_STATUSES: OrderStatus[] = ['pending_deposit', 'confirmed', 'picked_up'];

/**
 * Is `title` free for the whole [startDate, endDate] range?
 *
 * Checked against every other ACTIVE booking's stored date range and
 * item list. Two 'YYYY-MM-DD' ranges overlap exactly when each one's
 * start is on or before the other's end — plain string comparison
 * works because the format sorts the same as the calendar does.
 *
 * O(active bookings) rather than a SQL range query, because items is
 * jsonb (a booking can hold several products) and this app has one
 * shop — the same trade-off lib/db/schema.ts already made for orders.
 */
export async function isAvailable(
  title: string,
  startDate: string,
  endDate: string,
  excludeOrderNo?: string
): Promise<boolean> {
  const shopId = await getShopId();

  const active = await db
    .select({ orderNo: orders.orderNo, items: orders.items, startDate: orders.startDate, endDate: orders.endDate })
    .from(orders)
    .where(and(eq(orders.shopId, shopId), inArray(orders.status, ACTIVE_STATUSES)));

  return !active.some(o => {
    if (o.orderNo === excludeOrderNo) return false;
    if (!o.startDate || !o.endDate) return false;

    const overlaps = o.startDate <= endDate && o.endDate >= startDate;
    if (!overlaps) return false;

    return (o.items as OrderItemRow[]).some(i => i.title === title);
  });
}

/**
 * Every active booking whose date range touches [rangeStart, rangeEnd]
 * — the data behind the calendar view. Excludes cancelled bookings the
 * same way isAvailable() does: a cancelled booking never actually held
 * the item, so it has no business appearing on the calendar.
 */
export async function listBookingsInRange(
  rangeStart: string,
  rangeEnd: string
): Promise<Order[]> {
  const shopId = await getShopId();

  const rows = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.shopId, shopId),
        inArray(orders.status, ACTIVE_STATUSES),
        lte(orders.startDate, rangeEnd),
        gte(orders.endDate, rangeStart)
      )
    )
    .orderBy(orders.startDate);

  // Bookings with no dates yet (an in-progress conversation that
  // hasn't been confirmed) never reach `orders` — saveOrder() always
  // writes both — but a defensive filter costs nothing and means a
  // future data shape change can't put a blank row on every day.
  return rows.filter(o => o.startDate && o.endDate);
}

/* ─────────────────────────────────────────────────────────────
   Reads for the dashboard
   ───────────────────────────────────────────────────────────── */

export async function listOrders(limit = 200): Promise<Order[]> {
  const shopId = await getShopId();
  return db
    .select()
    .from(orders)
    .where(eq(orders.shopId, shopId))
    .orderBy(desc(orders.createdAt))
    .limit(limit);
}

export async function countPendingPayment(): Promise<number> {
  const shopId = await getShopId();
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.shopId, shopId), eq(orders.status, 'pending_deposit')));
  return rows.length;
}

export async function getOrdersForCustomer(customerId: string): Promise<Order[]> {
  const shopId = await getShopId();
  return db
    .select()
    .from(orders)
    .where(and(eq(orders.shopId, shopId), eq(orders.customerId, customerId)))
    .orderBy(desc(orders.createdAt));
}

/* ─────────────────────────────────────────────────────────────
   Writes from the dashboard
   ───────────────────────────────────────────────────────────── */

export function isOrderStatus(v: unknown): v is OrderStatus {
  return typeof v === 'string' && (ORDER_STATUSES as readonly string[]).includes(v);
}

/**
 * Move an order along, or attach a slip or tracking number.
 *
 * Note what is NOT updatable: items, subtotal, shipping, total. What
 * the customer agreed to is a record, not a working document. If a
 * price was wrong, the honest fix is cancelling and writing a new
 * order, so both the mistake and the correction are visible.
 */
export async function updateOrder(
  orderNo: string,
  patch: {
    status?: OrderStatus;
    slipUrl?: string;
    trackingNo?: string;
    note?: string;
  }
): Promise<Order | null> {
  const shopId = await getShopId();

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.slipUrl !== undefined) set.slipUrl = patch.slipUrl;
  if (patch.trackingNo !== undefined) set.trackingNo = patch.trackingNo;
  if (patch.note !== undefined) set.note = patch.note;

  const [row] = await db
    .update(orders)
    .set(set)
    .where(and(eq(orders.shopId, shopId), eq(orders.orderNo, orderNo)))
    .returning();

  return row ?? null;
}
