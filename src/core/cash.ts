import { db } from './db';
import { atomic, cashLine, line, post, validDate, walletAccount, walletBalance } from './ledger';
import { check, id, integer, labels, sum } from './model';
export type CashInput = {
  kind: 'opening' | 'deposit' | 'withdraw' | 'expense' | 'transfer' | 'closing' | 'correction';
  walletId: string;
  toId?: string;
  amount: number;
  date: number;
  reason: string;
  expected?: number;
};
export async function cashOperation(d: CashInput, key = id()) {
  return atomic(key, d.kind, d.reason, async () => {
    validDate(d.date);
    integer(d.amount);
    check(d.reason.trim(), 'شرح عملیات را وارد کنید.');
    await walletAccount(d.walletId);
    const before = await walletBalance(d.walletId);
    if (d.expected !== undefined)
      check(before === d.expected, 'مانده حساب تغییر کرده است؛ دوباره بررسی کنید.');
    const close = ['closing', 'correction'].includes(d.kind);
    if (d.kind === 'opening')
      check(
        !(await db.cashTransactions.where('walletId').equals(d.walletId).count()),
        'افتتاحیه فقط برای حساب بدون گردش مجاز است.',
      );
    if (d.kind === 'transfer')
      check(d.toId && d.toId !== d.walletId, 'حساب مقصد باید متفاوت باشد.');
    if (!close) integer(d.amount, 1);
    const delta = close
      ? d.amount - before
      : ['expense', 'withdraw', 'transfer'].includes(d.kind)
        ? -d.amount
        : d.amount;
    if (close) {
      check(
        !(await db.cashTransactions.where('walletId').equals(d.walletId).toArray()).some(
          (t) => t.date > d.date,
        ),
        'بستن حساب پیش از آخرین گردش مجاز نیست.',
      );
    }
    if (close)
      await db.adjustments.add({
        id: key,
        target: d.walletId,
        date: d.date,
        before,
        actual: d.amount,
        diff: delta,
        kind: d.kind,
        reason: d.reason,
      });
    if (delta) {
      const rows = [await cashLine(key, d.walletId, delta, d.date, d.kind, d.reason)];
      rows.push(
        d.kind === 'transfer'
          ? await cashLine(key, d.toId!, -delta, d.date, d.kind, d.reason)
          : line(
              close
                ? delta > 0
                  ? 'gains'
                  : 'losses'
                : d.kind === 'expense'
                  ? 'expenses'
                  : 'equity',
              Math.max(0, -delta),
              Math.max(0, delta),
            ),
      );
      await post(key, d.date, d.kind, d.reason, rows);
    }
    return key;
  });
}
/** Correct an erroneous settlement without erasing either the payment or original invoice.
 * A normal refund is different: it uses existing party credit. A reversal reopens the debt.
 */
export async function reverseMoney(docId: string, reason: string, key = id()) {
  const date = Date.now();
  check(reason.trim(), 'دلیل ابطال ضروری است.');
  return atomic(
    key,
    'cashReversal',
    reason,
    async () => {
      const original = (await db.journalEntries.where('docId').equals(docId).toArray())[0];
      check(original, 'سند مالی اصلی یافت نشد.');
      const pay = await db.payments.get(docId),
        type = pay ? 'paymentReversal' : 'cashReversal';
      check(
        !(await db.auditLogs
          .where('docId')
          .equals(docId)
          .filter((a) => a.type === 'cashReversal')
          .count()),
        'این گردش قبلاً ابطال شده است.',
      );
      const description = labels[type] + ' • ' + reason;
      if (pay) {
        check(!pay.voidedBy && !pay.reversalOf, 'پرداخت قبلاً ابطال شده است.');
        if (!pay.refund) {
          const allocated = await db.paymentAllocations.where('paymentId').equals(pay.id).toArray();
          check(
            !sum(
              allocated.filter((a) => a.target === 'refund'),
              (a) => a.amount,
            ),
            'ابتدا استردادهای وابسته را ابطال کنید.',
          );
          for (const target of new Set(
            allocated.filter((a) => a.target === 'invoice').map((a) => a.invoiceId),
          )) {
            const n = sum(
              allocated.filter((a) => a.target === 'invoice' && a.invoiceId === target),
              (a) => a.amount,
            );
            if (n)
              await db.paymentAllocations.add({
                id: id(),
                paymentId: pay.id,
                invoiceId: target,
                amount: -n,
                date,
                target: 'invoice',
              });
          }
        } else {
          for (const allocation of (
            await db.paymentAllocations.where('invoiceId').equals(pay.id).toArray()
          ).filter((a) => a.target === 'refund'))
            await db.paymentAllocations.add({
              ...allocation,
              id: id(),
              amount: -allocation.amount,
              date,
            });
        }
        await db.payments.update(pay.id, { voidedBy: key });
        await db.payments.add({
          ...pay,
          id: key,
          docId: key,
          date,
          description,
          refund: !pay.refund,
          reversalOf: pay.id,
        });
      } else
        check(
          ['deposit', 'withdraw', 'expense', 'transfer'].includes(original.type),
          'این نوع سند با عملیات اصلاحی مربوط به خود قابل تغییر است.',
        );
      const cash = await db.cashTransactions.where('docId').equals(docId).toArray();
      check(cash.length, 'گردش نقدی یافت نشد.');
      for (const r of cash) {
        await cashLine(key, r.walletId, -r.amount, date, type, description, r.partyId);
      }
      await db.cashTransactions
        .where('docId')
        .equals(key)
        .modify({ reversalOf: docId, sourceKind: original.type });
      const lines = await db.journalLines.where('entryId').equals(original.id).toArray();
      await post(
        key,
        date,
        type,
        description,
        lines.map((l) => line(l.accountId, l.credit, l.debit, l.partyId, l.walletId)),
      );
      return key;
    },
    docId,
  );
}
