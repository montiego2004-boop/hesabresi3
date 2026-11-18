import { db, documents, items, parties } from './db';
import { checkStockDate, consume, lotValue, move, receive } from './inventory';
import { atomic, balance, line, partyDate, post, walletAccount } from './ledger';
import { validateMedia } from './media';
import {
  check,
  id,
  integer,
  labels,
  sum,
  type Invoice,
  type Item,
  type Lot,
  type Side,
} from './model';
import { allocate, freePayment, invoiceDue, pay } from './payments';
export type DocInput = {
  side: Side;
  partyId: string;
  date: number;
  lines: { productId: string; qty: number; price: number }[];
  discount: number;
  fee: number;
  paid: number;
  walletId: string;
  notes: string;
  signatures?: { buyer?: string; seller?: string };
  attachment?: { name: string; data: string };
};
// BigInt rounding apportions every last Toman exactly; no fractional money is persisted.
const prorate = (n: number, part: number, total: number) =>
  total ? Number((BigInt(n) * BigInt(part)) / BigInt(total)) : 0;
export async function createInvoice(d: DocInput, key = id()) {
  return atomic(key, d.side, labels[d.side], async () => {
    const sale = d.side === 'sale',
      role = sale ? 'customer' : 'supplier';
    const party = await parties(role).get(d.partyId);
    check(party, 'طرف حساب را انتخاب کنید.');
    await partyDate(party.id, d.date);
    check(d.lines.length > 0, 'حداقل یک ردیف کالا لازم است.');
    integer(d.discount);
    integer(d.fee);
    integer(d.paid);
    const gross = sum(d.lines, (l) => integer(integer(l.qty, 1) * integer(l.price, 1)));
    check(d.discount <= gross, 'تخفیف از مبلغ کالاها بیشتر است.');
    check(sale || (!d.fee && !d.discount), 'هزینه خرید را در بهای واحد وارد کنید.');
    const total = integer(gross - d.discount + d.fee);
    const previous = await balance(role, party.id);
    const number =
      (sale ? 'S-' : 'P-') + String((await documents(d.side).count()) + 1).padStart(6, '0');
    const settings = await db.appSettings.get('main');
    let cumulative = 0;
    const rows: Item[] = [];
    for (const l of d.lines) {
      const pr = await db.products.get(l.productId);
      check(pr, 'کالا یافت نشد.');
      await checkStockDate(pr.id, d.date);
      const lots = sale
        ? await consume(pr.id, l.qty)
        : await receive(pr.id, l.qty, l.price, key, d.date);
      await move(
        key,
        pr.id,
        sale ? -l.qty : l.qty,
        d.side,
        d.date,
        lots,
        `${labels[d.side]} ${number}`,
        d.notes,
      );
      const g = l.qty * l.price;
      const net = prorate(total, cumulative + g, gross) - prorate(total, cumulative, gross);
      cumulative += g;
      rows.push({
        id: id(),
        invoiceId: key,
        productId: pr.id,
        name: pr.name,
        qty: l.qty,
        price: l.price,
        gross: g,
        net,
        cost: lotValue(lots),
        lots,
      });
    }
    const cost = sum(rows, (r) => r.cost);
    const inv: Invoice = {
      id: key,
      number,
      side: d.side,
      partyId: party.id,
      party: { ...party },
      business: settings!.business,
      logo: settings!.logo,
      date: d.date,
      createdAt: Date.now(),
      gross,
      discount: d.discount,
      fee: d.fee,
      total,
      cost,
      previous,
      paid: d.paid,
      method: d.paid
        ? (await walletAccount(d.walletId)) === 'cash'
          ? 'نقدی'
          : 'بانکی'
        : 'اعتباری',
      notes: d.notes,
      status: 'posted',
    };
    await documents(d.side).add(inv);
    await items(d.side).bulkAdd(rows);
    await post(
      key,
      d.date,
      d.side,
      `${labels[d.side]} ${number} • ${party.name}`,
      sale
        ? [
            line('ar', total, 0, party.id),
            line('sales', 0, integer(gross + d.fee)),
            line('discounts', d.discount),
            line('cogs', cost),
            line('inventory', 0, cost),
          ]
        : [line('inventory', total), line('ap', 0, total, party.id)],
    );
    if (d.paid)
      await pay(
        id(),
        {
          role,
          partyId: party.id,
          amount: d.paid,
          walletId: d.walletId,
          date: d.date,
          allocation: key,
        },
        key,
      );
    for (const p of (await db.payments.where('partyId').equals(party.id).sortBy('date')).filter(
      (p) => p.role === role && !p.refund,
    )) {
      const a = Math.min(await freePayment(p), await invoiceDue(inv));
      if (a > 0) await allocate(p, inv, a, d.date);
    }
    if (d.signatures)
      for (const [name, data] of Object.entries(d.signatures)) {
        if (data) {
          validateMedia(data, true);
          await db.signatures.add({ id: id(), docId: key, name, data });
        }
      }
    if (d.attachment) {
      validateMedia(d.attachment.data);
      await db.attachments.add({ id: id(), docId: key, ...d.attachment });
    }
    return key;
  });
}
export async function returnInvoice(
  side: Side,
  invoiceId: string,
  requested: { itemId: string; qty: number }[],
  reason: string,
  reverse = false,
  key = id(),
) {
  return atomic(
    key,
    reverse ? 'reversal' : side + 'Return',
    reason,
    async () => {
      const inv = await documents(side).get(invoiceId);
      check(inv && inv.status === 'posted', 'فاکتور ثبت‌شده پیدا نشد.');
      check(reason.trim(), 'دلیل برگشت یا ابطال ضروری است.');
      check(
        requested.length && new Set(requested.map((x) => x.itemId)).size === requested.length,
        'ردیف‌های برگشت معتبر نیستند.',
      );
      const prior = await db.returns.where('invoiceId').equals(invoiceId).toArray(),
        all = await items(side).where('invoiceId').equals(invoiceId).toArray();
      const retItems: { itemId: string; qty: number; net: number; cost: number }[] = [];
      const date = Date.now(),
        sale = side === 'sale';
      let fully = true;
      for (const l of all) {
        const prev = sum(
            prior.flatMap((r) => r.items).filter((i) => i.itemId === l.id),
            (r) => r.qty,
          ),
          qty = integer(requested.find((x) => x.itemId === l.id)?.qty || 0);
        check(prev + qty <= l.qty, 'مقدار برگشت بیشتر از تعداد قابل برگشت است.');
        if (prev + qty < l.qty) fully = false;
        if (!qty) continue;
        await checkStockDate(l.productId, date);
        let skip = prev,
          left = qty;
        const used: Lot[] = [];
        for (const lot of l.lots) {
          const start = Math.min(skip, lot.qty);
          skip -= start;
          const n = Math.min(left, lot.qty - start);
          if (!n) continue;
          const b = await db.inventoryBatches.get(lot.batchId);
          check(b, 'بچ کالا یافت نشد.');
          const remaining = b.remaining + (sale ? n : -n);
          check(
            remaining >= 0 && remaining <= b.quantity,
            'این مقدار از بچ خرید در انبار موجود نیست.',
          );
          await db.inventoryBatches.update(b.id, { remaining });
          used.push({ ...lot, qty: n });
          left -= n;
        }
        check(!left, 'بهای موجودی قابل بازسازی نیست.');
        const net = prorate(l.net, prev + qty, l.qty) - prorate(l.net, prev, l.qty);
        retItems.push({ itemId: l.id, qty, net, cost: lotValue(used) });
        await move(
          key,
          l.productId,
          sale ? qty : -qty,
          sale ? 'saleReturn' : 'purchaseReturn',
          date,
          used,
          reason,
        );
      }
      check(retItems.length, 'حداقل یک کارتن برای برگشت انتخاب کنید.');
      check(!reverse || fully, 'برای ابطال باید همه ردیف‌های باقی‌مانده برگشت بخورند.');
      const total = sum(retItems, (i) => i.net),
        cost = sum(retItems, (i) => i.cost);
      await db.returns.add({
        id: key,
        invoiceId,
        date,
        side,
        reason,
        total,
        cost,
        items: retItems,
      });
      await post(
        key,
        date,
        sale ? 'saleReturn' : 'purchaseReturn',
        reason,
        sale
          ? [
              line('salesReturns', total),
              line('ar', 0, total, inv.partyId),
              line('inventory', cost),
              line('cogs', 0, cost),
            ]
          : [line('ap', total, 0, inv.partyId), line('inventory', 0, cost)],
      );
      let excess = Math.max(0, -(await invoiceDue(inv)));
      const assignments = (
        await db.paymentAllocations.where('invoiceId').equals(invoiceId).toArray()
      ).filter((a) => a.target === 'invoice');
      for (const pid of [...new Set(assignments.map((a) => a.paymentId))]) {
        const n = Math.min(
          excess,
          sum(
            assignments.filter((a) => a.paymentId === pid),
            (a) => a.amount,
          ),
        );
        if (n > 0) {
          await db.paymentAllocations.add({
            id: id(),
            paymentId: pid,
            invoiceId,
            target: 'invoice',
            date,
            amount: -n,
          });
          excess -= n;
        }
        if (!excess) break;
      }
      if (fully) await documents(side).update(inv.id, { status: 'reversed' });
      return key;
    },
    invoiceId,
  );
}
