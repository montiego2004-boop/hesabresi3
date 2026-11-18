import { businessTables, db } from './db';
import { check, id, integer, sum, type Line, type Role } from './model';

const changed = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('daneh-commit'));
};
export async function atomic<T>(
  key: string,
  type: string,
  description: string,
  fn: () => Promise<T>,
  docId = key,
) {
  check(key, 'شناسه عملیات ضروری است.');
  const result = await db.transaction(
    'rw',
    businessTables.map((n) => db.table(n)),
    async () => {
      check(!(await db.auditLogs.get(key)), 'این عملیات قبلاً ثبت شده است.');
      const value = await fn();
      await db.auditLogs.add({ id: key, date: Date.now(), type, description, docId });
      return value;
    },
  );
  changed();
  return result;
}
type Posting = Pick<Line, 'accountId' | 'debit' | 'credit' | 'partyId' | 'walletId'>;
export const line = (
  accountId: string,
  debit = 0,
  credit = 0,
  partyId?: string,
  walletId?: string,
): Posting => ({ accountId, debit, credit, partyId, walletId });
export async function post(
  docId: string,
  date: number,
  type: string,
  description: string,
  rows: Posting[],
) {
  validDate(date);
  for (const l of rows) {
    integer(l.debit);
    integer(l.credit);
    check(!(l.debit && l.credit), 'سطر سند نامعتبر است.');
    check(await db.accounts.get(l.accountId), 'حساب کل یافت نشد.');
  }
  check(
    sum(rows, (l) => l.debit) === sum(rows, (l) => l.credit),
    'تراز بدهکار و بستانکار برابر نیست.',
  );
  const entryId = id();
  await db.journalEntries.add({
    id: entryId,
    sequence: ((await db.journalEntries.orderBy('sequence').last())?.sequence || 0) + 1,
    docId,
    date,
    type,
    description,
  });
  await db.journalLines.bulkAdd(
    rows.filter((l) => l.debit || l.credit).map((l) => ({ ...l, id: id(), entryId, date })),
  );
  return entryId;
}
export async function balance(role: Role, partyId: string) {
  const rows = await db.journalLines.where('partyId').equals(partyId).toArray();
  return sum(
    rows.filter((l) => l.accountId === (role === 'customer' ? 'ar' : 'ap')),
    (l) => (l.debit - l.credit) * (role === 'customer' ? 1 : -1),
  );
}
export async function walletBalance(walletId: string) {
  return sum(
    await db.cashTransactions.where('walletId').equals(walletId).toArray(),
    (r) => r.amount,
  );
}
export function validDate(date: number) {
  integer(date, 1);
  check(date <= Date.now(), 'تاریخ عملیات نمی‌تواند در آینده باشد.');
}
export async function partyDate(partyId: string, date: number) {
  validDate(date);
  check(
    !(await db.journalLines.where('partyId').equals(partyId).toArray()).some((l) => l.date > date),
    'تاریخ سند پیش از آخرین گردش طرف حساب است.',
  );
}
export async function walletAccount(walletId: string) {
  if (await db.cashAccounts.get(walletId)) return 'cash';
  check(await db.bankAccounts.get(walletId), 'حساب پرداخت انتخاب نشده است.');
  return 'bank';
}
export async function cashLine(
  docId: string,
  walletId: string,
  amount: number,
  date: number,
  kind: string,
  description: string,
  partyId?: string,
) {
  integer(Math.abs(amount), 1);
  validDate(date);
  check(
    !(await db.cashTransactions.where('walletId').equals(walletId).toArray()).some(
      (t) => t.date > date,
    ),
    'تاریخ گردش پیش از آخرین عملیات این حساب است.',
  );
  const code = await walletAccount(walletId);
  check(
    integer((await walletBalance(walletId)) + amount, Number.MIN_SAFE_INTEGER) >= 0,
    'موجودی حساب برای این پرداخت کافی نیست.',
  );
  await db.cashTransactions.add({
    id: id(),
    docId,
    walletId,
    amount,
    date,
    kind,
    description,
    partyId,
  });
  return line(code, Math.max(0, amount), Math.max(0, -amount), undefined, walletId);
}
