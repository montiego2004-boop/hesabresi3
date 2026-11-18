import { db } from './db';
import { atomic, line, post, validDate } from './ledger';
import { check, id, integer, sum, type Lot, type MoveKind } from './model';
export async function checkStockDate(productId: string, date: number) {
  validDate(date);
  check(await db.products.get(productId), 'دسته‌بندی کالا یافت نشد.');
  const moves = await db.stockMovements.where('productId').equals(productId).toArray();
  check(!moves.some((m) => m.date > date), 'تاریخ سند نباید پیش از آخرین گردش این کالا باشد.');
}
export async function receive(
  productId: string,
  qty: number,
  cost: number,
  docId: string,
  date: number,
) {
  integer(qty, 1);
  integer(cost);
  const batchId = id();
  await db.inventoryBatches.add({
    id: batchId,
    sequence: ((await db.inventoryBatches.orderBy('sequence').last())?.sequence || 0) + 1,
    productId,
    docId,
    date,
    createdAt: Date.now(),
    quantity: qty,
    remaining: qty,
    unitCost: cost,
  });
  return [{ batchId, qty, cost }];
}
export async function consume(productId: string, qty: number) {
  integer(qty, 1);
  const batches = (await db.inventoryBatches.where('productId').equals(productId).toArray())
    .filter((b) => b.remaining > 0)
    .sort((a, b) => a.date - b.date || a.sequence - b.sequence);
  let left = qty;
  const lots: Lot[] = [];
  for (const b of batches) {
    const n = Math.min(left, b.remaining);
    lots.push({ batchId: b.id, qty: n, cost: b.unitCost });
    await db.inventoryBatches.update(b.id, { remaining: b.remaining - n });
    left -= n;
    if (!left) break;
  }
  check(!left, 'موجودی قابل فروش این کالا کافی نیست.');
  return lots;
}
export const lotValue = (lots: Lot[]) => sum(lots, (l) => integer(l.qty * l.cost));
export const move = (
  docId: string,
  productId: string,
  qty: number,
  kind: MoveKind,
  date: number,
  lots: Lot[],
  reason: string,
  notes = '',
) => db.stockMovements.add({ id: id(), docId, productId, qty, kind, date, lots, reason, notes });
export type AdjustInput = {
  productId: string;
  kind: 'count' | 'damage' | 'adjustUp' | 'adjustDown' | 'otherUp' | 'otherDown' | 'openingStock';
  qty: number;
  unitCost: number;
  reason: string;
  date: number;
  expected?: number;
};
export async function adjustStock(d: AdjustInput, key = id()) {
  return atomic(key, d.kind, d.reason, async () => {
    integer(d.qty);
    integer(d.unitCost);
    check(d.reason.trim(), 'دلیل اصلاح را وارد کنید.');
    await checkStockDate(d.productId, d.date);
    if (d.kind === 'openingStock')
      check(
        !(await db.stockMovements.where('productId').equals(d.productId).count()),
        'افتتاحیه کالا فقط پیش از اولین گردش ثبت می‌شود.',
      );
    const before = sum(
      await db.inventoryBatches.where('productId').equals(d.productId).toArray(),
      (b) => b.remaining,
    );
    if (d.expected !== undefined)
      check(before === d.expected, 'موجودی تغییر کرده است؛ شمارش را دوباره بررسی کنید.');
    const diff =
      d.kind === 'count'
        ? d.qty - before
        : d.qty * (['damage', 'adjustDown', 'otherDown'].includes(d.kind) ? -1 : 1);
    const kind = d.kind === 'count' ? (diff >= 0 ? 'countUp' : 'countDown') : d.kind;
    check(before + diff >= 0, 'موجودی برای این اصلاح کافی نیست.');
    if (diff) {
      const lots =
        diff > 0
          ? await receive(d.productId, diff, d.unitCost, key, d.date)
          : await consume(d.productId, -diff);
      const value = lotValue(lots);
      await move(key, d.productId, diff, kind, d.date, lots, d.reason);
      await post(
        key,
        d.date,
        kind,
        d.reason,
        diff > 0
          ? [line('inventory', value), line(kind === 'openingStock' ? 'equity' : 'gains', 0, value)]
          : [line('losses', value), line('inventory', 0, value)],
      );
    }
    await db.adjustments.add({
      id: key,
      target: d.productId,
      date: d.date,
      before,
      actual: before + diff,
      diff,
      kind,
      reason: d.reason,
    });
    return key;
  });
}
