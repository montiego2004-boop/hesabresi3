import { db, documents, parties } from './db';
import { atomic, balance, cashLine, line, partyDate, post } from './ledger';
import {
  check,
  id,
  integer,
  labels,
  sum,
  type Invoice,
  type Payment,
  type Role,
  type Side,
} from './model';
const sideFor = (r: Role): Side => (r === 'customer' ? 'sale' : 'purchase');
export async function invoiceDue(inv: Invoice) {
  return (
    inv.total -
    sum(await db.returns.where('invoiceId').equals(inv.id).toArray(), (r) => r.total) -
    sum(
      (await db.paymentAllocations.where('invoiceId').equals(inv.id).toArray()).filter(
        (a) => a.target === 'invoice',
      ),
      (a) => a.amount,
    )
  );
}
export async function freePayment(p: Payment) {
  if (p.voidedBy || p.reversalOf) return 0;
  return (
    p.amount -
    sum(await db.paymentAllocations.where('paymentId').equals(p.id).toArray(), (a) => a.amount)
  );
}
export async function allocate(p: Payment, inv: Invoice, amount: number, date: number) {
  integer(amount, 1);
  check(
    !p.refund &&
      !p.voidedBy &&
      !p.reversalOf &&
      inv.partyId === p.partyId &&
      inv.side === sideFor(p.role) &&
      inv.status === 'posted',
    'تخصیص به این فاکتور مجاز نیست.',
  );
  check(amount <= (await freePayment(p)), 'تخصیص از مبلغ پرداخت بیشتر است.');
  check(amount <= (await invoiceDue(inv)), 'تخصیص از مانده فاکتور بیشتر است.');
  await db.paymentAllocations.add({
    id: id(),
    paymentId: p.id,
    invoiceId: inv.id,
    date,
    amount,
    target: 'invoice',
  });
}
export async function allocatePayment(
  paymentId: string,
  parts: { invoiceId: string; amount: number }[],
  key = id(),
) {
  return atomic(key, 'allocation', labels.allocation, async () => {
    const p = await db.payments.get(paymentId);
    check(p, 'پرداخت یافت نشد.');
    check(parts.length, 'فاکتوری انتخاب نشده است.');
    for (const part of parts) {
      const inv = await documents(sideFor(p.role)).get(part.invoiceId);
      check(inv, 'فاکتور یافت نشد.');
      await allocate(p, inv, part.amount, Date.now());
    }
  });
}
export type PayInput = {
  role: Role;
  partyId: string;
  walletId: string;
  amount: number;
  date: number;
  notes?: string;
  refund?: boolean;
  allocation?: 'auto' | 'advance' | string;
};
export async function pay(key: string, p: PayInput, docId = key) {
  integer(p.amount, 1);
  const party = await parties(p.role).get(p.partyId);
  check(party, 'طرف حساب را انتخاب کنید.');
  await partyDate(party.id, p.date);
  const customer = p.role === 'customer',
    refund = !!p.refund;
  const kind = customer
    ? refund
      ? 'customerRefund'
      : 'receipt'
    : refund
      ? 'supplierRefund'
      : 'pay';
  const sign = (customer ? 1 : -1) * (refund ? -1 : 1);
  if (refund)
    check(
      (await balance(p.role, p.partyId)) <= -p.amount,
      'استرداد نمی‌تواند بیشتر از بستانکاری طرف حساب باشد.',
    );
  const description = p.notes?.trim() || labels[kind] + ' • ' + party.name;
  const payment: Payment = {
    id: key,
    partyId: p.partyId,
    role: p.role,
    date: p.date,
    amount: p.amount,
    walletId: p.walletId,
    refund,
    description,
    docId,
  };
  await db.payments.add(payment);
  await post(key, p.date, kind, description, [
    await cashLine(key, p.walletId, p.amount * sign, p.date, kind, description, p.partyId),
    line(customer ? 'ar' : 'ap', sign < 0 ? p.amount : 0, sign > 0 ? p.amount : 0, p.partyId),
  ]);
  if (refund) {
    let left = p.amount;
    for (const q of (await db.payments.where('partyId').equals(p.partyId).toArray()).filter(
      (q) => !q.refund && q.role === p.role,
    )) {
      const a = Math.min(left, await freePayment(q));
      if (a > 0) {
        await db.paymentAllocations.add({
          id: id(),
          paymentId: q.id,
          invoiceId: key,
          target: 'refund',
          date: p.date,
          amount: a,
        });
        left -= a;
      }
      if (!left) break;
    }
  } else if (p.allocation !== 'advance') {
    const list = (
      await documents(sideFor(p.role)).where('partyId').equals(p.partyId).sortBy('date')
    ).filter((i) => i.status === 'posted');
    if (p.allocation && p.allocation !== 'auto')
      list.sort((a, b) => Number(b.id === p.allocation) - Number(a.id === p.allocation));
    for (const inv of list) {
      const a = Math.min(await freePayment(payment), await invoiceDue(inv));
      if (a > 0) await allocate(payment, inv, a, p.date);
      if (!(await freePayment(payment))) break;
    }
  }
  return key;
}
export const recordPayment = (p: PayInput, key = id()) =>
  atomic(
    key,
    p.refund ? 'refund' : p.role === 'customer' ? 'receipt' : 'pay',
    p.notes || 'ثبت تسویه',
    () => pay(key, p),
  );
