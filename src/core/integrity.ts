import type { Payload } from './backup';
import { check, integer, sum } from './model';

/** Cross-store source-document checks, in addition to schema, referential and trial-balance checks. */
export function reconcileSources(t: Payload['tables']) {
  const valid = (v: unknown) =>
    check(v, 'سند، دفتر حساب یا گردش انبار در نسخه پشتیبان با هم تطبیق ندارند.');
  function group(rows: any[], key: string) {
    const result = new Map<string, any[]>();
    for (const r of rows) {
      const list = result.get(r[key]) || [];
      list.push(r);
      result.set(r[key], list);
    }
    return result;
  }
  const entries = group(t.journalEntries, 'docId'),
    journal = group(t.journalLines, 'entryId'),
    moves = group(t.stockMovements, 'docId'),
    cash = group(t.cashTransactions, 'docId');
  const saleItems = group(t.salesInvoiceItems, 'invoiceId'),
    buyItems = group(t.purchaseInvoiceItems, 'invoiceId'),
    payments = group(t.payments, 'docId'),
    returns = group(t.returns, 'invoiceId');
  const batches = new Map(t.inventoryBatches.map((b) => [b.id, b]));
  for (const rows of [t.inventoryBatches, t.journalEntries]) {
    const sequences = new Set();
    for (const r of rows) {
      integer(r.sequence, 1);
      valid(!sequences.has(r.sequence));
      sequences.add(r.sequence);
    }
  }
  const accounts = new Set(t.accounts.map((a) => a.id));
  for (const r of t.journalEntries)
    valid(typeof r.description === 'string' && typeof r.type === 'string');
  const getLines = (docId: string, type?: string) => {
    const es = entries.get(docId) || [];
    valid(es.length === 1 && (!type || es[0].type === type));
    return journal.get(es[0].id) || [];
  };
  const account = (lines: any[], code: string) =>
    sum(
      lines.filter((l) => l.accountId === code),
      (l) => l.debit - l.credit,
    );
  const expected = (lines: any[], values: Record<string, number>) => {
    for (const code of new Set([...Object.keys(values), ...lines.map((l) => l.accountId)]))
      valid(accounts.has(code) && account(lines, code) === (values[code] || 0));
  };
  for (const [side, invoices, linesByDoc] of [
    ['sale', t.salesInvoices, saleItems],
    ['purchase', t.purchaseInvoices, buyItems],
  ] as const) {
    const ids = new Set(invoices.map((i) => i.id));
    for (const k of linesByDoc.keys()) valid(ids.has(k));
    for (const i of invoices) {
      valid(
        i.side === side &&
          typeof i.business === 'string' &&
          typeof i.notes === 'string' &&
          typeof i.method === 'string' &&
          typeof i.number === 'string' &&
          i.number.length,
      );
      for (const field of ['name', 'phone', 'address', 'delivery', 'notes'])
        valid(typeof i.party[field] === 'string');
      const j = getLines(i.id, side);
      expected(
        j,
        side === 'sale'
          ? {
              ar: i.total,
              sales: -(i.gross + i.fee),
              discounts: i.discount,
              cogs: i.cost,
              inventory: -i.cost,
            }
          : { inventory: i.total, ap: -i.total },
      );
      valid(
        j.every(
          (l) =>
            l.date === i.date && (!['ar', 'ap'].includes(l.accountId) || l.partyId === i.partyId),
        ),
      );
      const lines = linesByDoc.get(i.id) || [],
        movement = moves.get(i.id) || [];
      valid(lines.length === movement.length);
      const distribution = new Map<string, number>();
      const bump = (map: Map<string, number>, key: string, n: number) =>
        map.set(key, (map.get(key) || 0) + n);
      for (const l of lines) {
        integer(l.net);
        integer(l.cost);
        valid(
          typeof l.name === 'string' &&
            sum(l.lots, (lot: any) => integer(lot.qty, 1) * integer(lot.cost)) === l.cost,
        );
        for (const lot of l.lots) {
          const batch = batches.get(lot.batchId);
          valid(batch?.productId === l.productId && batch?.unitCost === lot.cost);
          if (side === 'purchase') valid(batch?.docId === i.id && lot.cost === l.price);
          bump(distribution, lot.batchId, lot.qty);
        }
      }
      for (const m of movement) {
        valid(
          m.date === i.date && m.kind === side && Math.sign(m.qty) === (side === 'sale' ? -1 : 1),
        );
        for (const lot of m.lots) bump(distribution, lot.batchId, -lot.qty);
      }
      valid([...distribution.values()].every((q) => q === 0));
      valid(sum(payments.get(i.id) || [], (p) => p.amount) === i.paid);
      if (i.status === 'reversed')
        valid(
          sum(
            (returns.get(i.id) || []).flatMap((r) => r.items),
            (x) => x.qty,
          ) === sum(lines, (l) => l.qty),
        );
    }
  }
  for (const r of t.returns) {
    const j = getLines(r.id, r.side + 'Return');
    expected(
      j,
      r.side === 'sale'
        ? { ar: -r.total, salesReturns: r.total, inventory: r.cost, cogs: -r.cost }
        : { ap: r.total, inventory: -r.cost },
    );
    valid(sum(r.items, (x: any) => x.cost) === r.cost);
    const m = moves.get(r.id) || [];
    valid(sum(m, (x) => Math.abs(x.qty)) === sum(r.items, (x: any) => x.qty));
    valid(sum(m, (x) => sum(x.lots, (l: any) => l.qty * l.cost)) === r.cost);
  }
  const payMap = new Map(t.payments.map((p) => [p.id, p]));
  for (const p of t.payments) {
    valid(
      ['customer', 'supplier'].includes(p.role) &&
        typeof p.refund === 'boolean' &&
        typeof p.description === 'string',
    );
    const rows = cash.get(p.id) || [];
    valid(rows.length === 1 && rows[0].walletId === p.walletId && rows[0].partyId === p.partyId);
    const sign = (p.role === 'customer' ? 1 : -1) * (p.refund ? -1 : 1);
    valid(rows[0].amount === p.amount * sign);
    const j = getLines(p.id);
    valid(account(j, p.role === 'customer' ? 'ar' : 'ap') === -sign * p.amount);
    valid(j.filter((l) => l.partyId).every((l) => l.partyId === p.partyId));
    if (p.voidedBy) valid(payMap.get(p.voidedBy)?.reversalOf === p.id);
    if (p.reversalOf) {
      const q = payMap.get(p.reversalOf);
      valid(
        q?.voidedBy === p.id &&
          q.amount === p.amount &&
          q.refund !== p.refund &&
          q.partyId === p.partyId &&
          q.walletId === p.walletId,
      );
    }
  }
  const cashIds = new Set(t.cashAccounts.map((w) => w.id));
  for (const [docId, rows] of cash) {
    const j = getLines(docId);
    for (const w of new Set(rows.map((r) => r.walletId))) {
      const code = cashIds.has(w) ? 'cash' : 'bank';
      valid(
        sum(
          rows.filter((r) => r.walletId === w),
          (r) => r.amount,
        ) ===
          account(
            j.filter((l) => l.walletId === w),
            code,
          ),
      );
    }
  }
  const pairs = new Map<string, number>();
  for (const a of t.paymentAllocations) {
    const k = JSON.stringify([a.paymentId, a.target, a.invoiceId]);
    pairs.set(k, (pairs.get(k) || 0) + a.amount);
  }
  valid([...pairs.values()].every((n) => Number.isSafeInteger(n) && n >= 0));
  for (const a of t.adjustments) {
    for (const k of ['before', 'actual']) integer(a[k]);
    integer(a.diff, Number.MIN_SAFE_INTEGER);
    valid(a.diff === a.actual - a.before && typeof a.reason === 'string');
    const isCash = ['closing', 'correction'].includes(a.kind);
    if (a.diff !== 0)
      valid(
        isCash
          ? sum(cash.get(a.id) || [], (r) => r.amount) === a.diff
          : sum(moves.get(a.id) || [], (m) => m.qty) === a.diff,
      );
  }
}
