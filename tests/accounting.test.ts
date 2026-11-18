import 'fake-indexeddb/auto';
import { beforeEach, describe, it, expect } from 'vitest';
import { db, initialize } from '../src/core/db';
import {
  saveParty,
  balance,
  saveProduct,
  createInvoice,
  recordPayment,
  allocatePayment,
  cashOperation,
  adjustStock,
  returnInvoice,
  walletBalance,
  atomic,
  invoiceDue,
  addBank,
  type DocInput,
} from '../src/core/engine';
import { id, sum, numberOf, dayStart } from '../src/core/model';
import { readBook, stock, summary, report, partyBalance, docDue } from '../src/core/reports';
import {
  capture,
  verify,
  exportBackup,
  importBackup,
  restore,
  snapshot,
  loadSnapshot,
  pinHash,
} from '../src/core/backup';
let customer: string, supplier: string;
beforeEach(async () => {
  await db.delete();
  await db.open();
  await initialize();
  customer = await saveParty('customer', {
    name: 'مشتری آزمون',
    address: 'نشانی فروشگاه',
    delivery: 'نشانی تحویل',
  });
  supplier = await saveParty('supplier', { name: 'تأمین‌کننده آزمون', phone: '۰۹۱۲۳۴۵۶۷۸۹' });
});
const purchase = (qty: number, price: number, more: Partial<DocInput> = {}) =>
  createInvoice({
    side: 'purchase',
    partyId: supplier,
    date: Date.now(),
    lines: [{ productId: 'light', qty, price }],
    discount: 0,
    fee: 0,
    paid: 0,
    walletId: 'cash',
    notes: '',
    ...more,
  });
const sale = (qty: number, price: number, more: Partial<DocInput> = {}) =>
  createInvoice({
    side: 'sale',
    partyId: customer,
    date: Date.now(),
    lines: [{ productId: 'light', qty, price }],
    discount: 0,
    fee: 0,
    paid: 0,
    walletId: 'cash',
    notes: '',
    ...more,
  });
const receipt = (amount: number, allocation = 'auto') =>
  recordPayment({
    role: 'customer',
    partyId: customer,
    walletId: 'cash',
    amount,
    date: Date.now(),
    allocation,
  });
const funds = (amount: number, walletId = 'cash') =>
  cashOperation({ kind: 'opening', walletId, amount, date: Date.now(), reason: 'افتتاحیه آزمون' });
const trial = async () => {
  const book = await readBook();
  expect(sum(book.lines, (l) => l.debit - l.credit)).toBe(0);
  for (const e of book.entries)
    expect(
      sum(
        book.lines.filter((l) => l.entryId === e.id),
        (l) => l.debit - l.credit,
      ),
    ).toBe(0);
  verify(await capture());
  return book;
};
describe('local directory and persistence', () => {
  it('seeds only real categories and chart of accounts, no invented finances', async () => {
    expect(await db.products.count()).toBe(3);
    expect(await db.journalEntries.count()).toBe(0);
    await initialize();
    expect(await db.products.count()).toBe(3);
  });
  it('persists full addresses and edits across a database close and reopen', async () => {
    await saveParty('customer', {
      id: customer,
      name: 'ویرایش شده',
      delivery: 'نشانی جدید',
      instructions: 'زنگ دوم',
      location: 'محل تحویل',
      time: 'صبح',
    });
    db.close();
    await db.open();
    expect(await db.customers.get(customer)).toMatchObject({
      name: 'ویرایش شده',
      address: 'نشانی فروشگاه',
      delivery: 'نشانی جدید',
      instructions: 'زنگ دوم',
      time: 'صبح',
    });
    expect(await db.suppliers.get(supplier)).toMatchObject({ phone: '۰۹۱۲۳۴۵۶۷۸۹' });
    await saveParty('supplier', { id: supplier, name: 'نام جدید' });
    expect(await db.suppliers.count()).toBe(1);
  });
  it('validates names and whole Toman amounts (including Persian digits)', async () => {
    expect(numberOf('۲٬۴۰۰')).toBe(2400);
    expect(() => numberOf('1.5')).toThrow();
    await expect(saveParty('customer', { name: ' ' })).rejects.toThrow();
    await expect(purchase(1, 0.5)).rejects.toThrow();
    await expect(purchase(2, Number.MAX_SAFE_INTEGER)).rejects.toThrow();
    expect(await db.purchaseInvoices.count()).toBe(0);
  });
});
describe('acceptance calculations and settlement', () => {
  it('A: debt 5M + invoice 12M − receipt 7M = debt 10M', async () => {
    customer = await saveParty('customer', { name: 'الف' }, 5000000);
    await purchase(1, 1);
    await sale(1, 12000000, { paid: 7000000 });
    expect(await balance('customer', customer)).toBe(10000000);
    await trial();
  });
  it('B: credit 2M + invoice 5M − receipt 1M = debt 2M', async () => {
    await receipt(2000000, 'advance');
    await purchase(1, 1);
    const key = await sale(1, 5000000, { paid: 1000000 });
    expect(await balance('customer', customer)).toBe(2000000);
    expect(await invoiceDue((await db.salesInvoices.get(key))!)).toBe(2000000);
    await trial();
  });
  it('C: debt 1M − receipt 1.5M = credit 500k', async () => {
    customer = await saveParty('customer', { name: 'ج' }, 1000000);
    await receipt(1500000);
    expect(await balance('customer', customer)).toBe(-500000);
    await trial();
  });
  it('D: a multi-invoice allocation may not exceed the payment; failures roll back ALL parts', async () => {
    await purchase(2, 10);
    const a = await sale(1, 100),
      b = await sale(1, 100),
      p = await receipt(80, 'advance');
    await expect(
      allocatePayment(p, [
        { invoiceId: a, amount: 60 },
        { invoiceId: b, amount: 30 },
      ]),
    ).rejects.toThrow();
    expect(await db.paymentAllocations.count()).toBe(0);
    await allocatePayment(p, [
      { invoiceId: a, amount: 50 },
      { invoiceId: b, amount: 30 },
    ]);
    await expect(allocatePayment(p, [{ invoiceId: b, amount: 1 }])).rejects.toThrow();
    expect(await invoiceDue((await db.salesInvoices.get(a))!)).toBe(50);
    await trial();
  });
  it('E: FIFO sale reconciles inventory, AR, receipts, sales, COGS and trial balance', async () => {
    await purchase(3, 20);
    await purchase(5, 30);
    const k = await sale(5, 100, { discount: 25, fee: 5, paid: 180 });
    const book = await trial();
    expect(book.sales[0]).toMatchObject({ id: k, total: 480, cost: 120, paid: 180 });
    expect(stock(book, 'light')).toMatchObject({ qty: 3, value: 90 });
    expect(partyBalance(book, 'customer', customer)).toBe(300);
    expect(await walletBalance('cash')).toBe(180);
    expect(summary(book)).toMatchObject({ profit: 360, gross: 360, revenue: 480 });
    expect(report(book, 'balanceSheet').rows.at(-1)?.[1]).toBe('۰');
  });
  it('allocates one receipt over multiple invoices and more receipts to the same invoice', async () => {
    await purchase(2, 30);
    const a = await sale(1, 100),
      b = await sale(1, 200);
    await receipt(170);
    await receipt(100);
    const book = await trial();
    expect(
      docDue(
        book,
        book.sales.find((i) => i.id === a)!,
      ),
    ).toBe(0);
    expect(
      docDue(
        book,
        book.sales.find((i) => i.id === b)!,
      ),
    ).toBe(30);
  });
  it('supports supplier advances, partial settlement and refunds with separate AP', async () => {
    await funds(1000);
    await recordPayment({
      role: 'supplier',
      partyId: supplier,
      walletId: 'cash',
      amount: 180,
      date: Date.now(),
      allocation: 'advance',
    });
    const i = await purchase(2, 100);
    expect(await balance('supplier', supplier)).toBe(20);
    await recordPayment({
      role: 'supplier',
      partyId: supplier,
      walletId: 'cash',
      amount: 50,
      date: Date.now(),
    });
    expect(await balance('supplier', supplier)).toBe(-30);
    await recordPayment({
      role: 'supplier',
      partyId: supplier,
      walletId: 'cash',
      amount: 30,
      refund: true,
      date: Date.now(),
    });
    expect(await balance('supplier', supplier)).toBe(0);
    expect(await invoiceDue((await db.purchaseInvoices.get(i))!)).toBe(0);
    expect(await walletBalance('cash')).toBe(800);
    await trial();
  });
});
describe('permanent inventory and invoice evidence', () => {
  it('protects default stock levels and atomically rolls back a failing second item', async () => {
    await purchase(1, 100);
    const before = await capture();
    await expect(
      sale(1, 200, {
        lines: [
          { productId: 'light', qty: 1, price: 200 },
          { productId: 'heavy', qty: 1, price: 400 },
        ],
      }),
    ).rejects.toThrow();
    expect((await capture()).tables).toEqual(before.tables);
  });
  it('handles physical increases/decreases and zero-difference counts without inventing purchases', async () => {
    for (const qty of [7, 4, 4])
      await adjustStock({
        productId: 'heavy',
        kind: 'count',
        qty,
        unitCost: 40,
        date: Date.now(),
        reason: 'شمارش انبار',
      });
    expect(await db.purchaseInvoices.count()).toBe(0);
    expect(await db.adjustments.count()).toBe(3);
    const book = await trial();
    expect(stock(book, 'heavy')).toMatchObject({ qty: 4, movementQty: 4, value: 160 });
    expect(book.entries.map((e) => e.type).sort()).toEqual(['countDown', 'countUp']);
  });
  it('records damage, manual corrections, documented movements and rejects stale stocktakes', async () => {
    await purchase(10, 10);
    for (const kind of ['damage', 'adjustUp', 'adjustDown', 'otherUp', 'otherDown'] as const)
      await adjustStock({
        productId: 'light',
        kind,
        qty: 2,
        unitCost: 10,
        reason: 'سند انبار',
        date: Date.now(),
      });
    await expect(
      adjustStock({
        productId: 'light',
        kind: 'count',
        qty: 9,
        unitCost: 10,
        reason: 'شمارش',
        expected: 10,
        date: Date.now(),
      }),
    ).rejects.toThrow();
    const b = await trial();
    expect(stock(b, 'light')).toMatchObject({ qty: 8, damaged: 2, value: 80 });
    expect(b.moves.every((m) => m.id && m.docId && m.reason)).toBe(true);
  });
  it('freezes product and party invoice snapshots; never rewrites a past FIFO issue', async () => {
    await purchase(2, 50);
    const k = await sale(1, 150);
    const p = (await db.products.get('light'))!;
    await saveProduct({ ...p, name: 'نام جدید', salePrice: 250 });
    await saveParty('customer', { id: customer, name: 'مشتری جدید' });
    expect((await db.salesInvoiceItems.where('invoiceId').equals(k).first())!.name).toBe(
      'تخم‌مرغ سبک',
    );
    expect((await db.salesInvoices.get(k))!.party.name).toBe('مشتری آزمون');
    await expect(purchase(1, 1, { date: Date.now() - 86400000 })).rejects.toThrow();
    await trial();
  });
  it('reverses original costs in stages, releases allocations and preserves original invoice', async () => {
    await purchase(3, 100);
    await purchase(2, 200);
    const k = await sale(4, 300, { discount: 13, fee: 2, paid: 1189 });
    const l = (await db.salesInvoiceItems.where('invoiceId').equals(k).first())!;
    await returnInvoice('sale', k, [{ itemId: l.id, qty: 2 }], 'برگشت بخشی');
    await returnInvoice('sale', k, [{ itemId: l.id, qty: 2 }], 'ابطال باقی‌مانده', true);
    expect(await db.salesInvoices.get(k)).toMatchObject({
      total: 1189,
      status: 'reversed',
      cost: 500,
    });
    expect(await balance('customer', customer)).toBe(-1189);
    const b = await trial();
    expect(stock(b, 'light')).toMatchObject({ value: 700, qty: 5 });
    expect(summary(b).profit).toBe(0);
    await recordPayment({
      role: 'customer',
      partyId: customer,
      walletId: 'cash',
      amount: 1189,
      date: Date.now(),
      refund: true,
    });
    expect(await walletBalance('cash')).toBe(0);
    await expect(returnInvoice('sale', k, [{ itemId: l.id, qty: 1 }], 'دوباره')).rejects.toThrow();
    await trial();
  });
  it('prevents purchase returns for cartons already sold; returns unsold batch at its cost', async () => {
    const k = await purchase(5, 10);
    await sale(3, 40);
    const l = (await db.purchaseInvoiceItems.toArray())[0];
    await expect(
      returnInvoice('purchase', k, [{ itemId: l.id, qty: 4 }], 'برگشت'),
    ).rejects.toThrow();
    await returnInvoice('purchase', k, [{ itemId: l.id, qty: 2 }], 'مرجوعی سالم');
    expect(await balance('supplier', supplier)).toBe(30);
    expect(stock(await trial(), 'light').qty).toBe(0);
  });
  it('deduplicates repeated concurrent submissions with the same idempotency token', async () => {
    const key = id(),
      input: DocInput = {
        side: 'purchase',
        partyId: supplier,
        date: Date.now(),
        lines: [{ productId: 'heavy', qty: 2, price: 100 }],
        discount: 0,
        fee: 0,
        paid: 0,
        walletId: 'cash',
        notes: '',
      };
    const result = await Promise.allSettled([createInvoice(input, key), createInvoice(input, key)]);
    expect(result.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(await db.purchaseInvoices.count()).toBe(1);
    await trial();
  });
  it('rolls back a simulated interrupted database operation, including audit metadata', async () => {
    const before = await capture();
    await expect(
      atomic(id(), 'test', 'interruption', async () => {
        await db.customers.update(customer, { name: 'نباید ذخیره شود' });
        throw Error('interrupted');
      }),
    ).rejects.toThrow();
    expect((await capture()).tables).toEqual(before.tables);
  });
});
describe('separate cash and bank ledgers', () => {
  it('posts an opening, transfers, expenses, owner withdrawals/deposits and physical reconciliation', async () => {
    await funds(1000);
    const bank = await addBank('بانک دوم');
    const op = async (kind: any, amount: number, walletId = 'cash', toId?: string) =>
      cashOperation({ kind, amount, walletId, toId, date: Date.now(), reason: 'عملیات آزمون' });
    await op('transfer', 400, 'cash', bank);
    await op('transfer', 100, bank, 'cash');
    await op('expense', 80);
    await op('withdraw', 20);
    await op('deposit', 50);
    await op('closing', 630);
    expect(await walletBalance('cash')).toBe(630);
    expect(await walletBalance(bank)).toBe(300);
    expect((await db.adjustments.toArray())[0]).toMatchObject({
      before: 650,
      actual: 630,
      diff: -20,
    });
    expect(summary(await trial()).expense).toBe(80);
    await expect(funds(3)).rejects.toThrow();
  });
  it('rejects insufficient funds and transfers to the same account without posting', async () => {
    const before = await capture();
    await expect(
      cashOperation({
        kind: 'transfer',
        walletId: 'cash',
        toId: 'cash',
        amount: 5,
        date: Date.now(),
        reason: 'انتقال',
      }),
    ).rejects.toThrow();
    await expect(purchase(2, 40, { paid: 80 })).rejects.toThrow();
    expect((await capture()).tables).toEqual(before.tables);
  });
  it('generates date-filtered real reports and cross-checks journal and batch totals', async () => {
    await purchase(2, 20);
    await sale(1, 70);
    const b = await trial();
    expect(report(b, 'ledger').rows.length).toBe(b.lines.length);
    expect(report(b, 'customers').rows[0]).toEqual(['مشتری آزمون', '۷۰', '۲۰', '۵۰']);
    expect(report(b, 'category', 0, dayStart() - 1).rows).toEqual([]);
    expect(report(b, 'valuation').rows.find((r) => r[0] === 'تخم‌مرغ سبک')).toEqual([
      'تخم‌مرغ سبک',
      '۱',
      '۲۰',
    ]);
  });
});
describe('portable backup and safe restore', () => {
  const sig =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+kxWQAAAAASUVORK5CYII=';
  it('encrypts everything, detects damage/wrong password, and restores signatures/attachments and historical costs', async () => {
    await purchase(2, 200, {
      attachment: { name: 'رسید.pdf', data: 'data:application/pdf;base64,JVBERi0xLjQK' },
    });
    await sale(1, 500, { signatures: { buyer: sig, seller: sig } });
    const before = await capture(),
      out = await exportBackup('correct-password');
    expect(out.text.includes(customer)).toBe(false);
    expect(out.text.includes('نشانی')).toBe(false);
    await expect(importBackup(out.text, 'wrong-password')).rejects.toThrow();
    const corrupt = JSON.parse(out.text);
    corrupt.cipher = (corrupt.cipher[0] === 'Z' ? 'A' : 'Z') + corrupt.cipher.slice(1);
    await expect(importBackup(JSON.stringify(corrupt), 'correct-password')).rejects.toThrow();
    const p = await importBackup(out.text, 'correct-password');
    await saveParty('customer', { name: 'قبل بازیابی' });
    await expect(restore(p, false)).rejects.toThrow();
    expect(await db.customers.count()).toBe(2);
    await restore(p, true);
    const after = await capture();
    for (const k of Object.keys(p.tables).filter(
      (k) => !['auditLogs', 'backupHistory'].includes(k),
    ))
      expect(after.tables[k as keyof typeof p.tables]).toEqual(
        before.tables[k as keyof typeof p.tables],
      );
    const safety = (await db.snapshots.where('kind').equals('safety').first())!;
    expect((await loadSnapshot(safety.id)).tables.customers).toHaveLength(2);
    await trial();
  });
  it('rejects incompatible schemas, orphan references, tampered FIFO quantities and unbalanced journals without replacement', async () => {
    await purchase(2, 20);
    await sale(1, 100);
    const original = await capture();
    for (const mutate of [
      (p: any) => p.schema++,
      (p: any) => (p.tables.stockMovements[0].qty = 7),
      (p: any) => p.tables.journalLines[0].debit++,
      (p: any) => (p.tables.salesInvoices[0].partyId = 'missing'),
      (p: any) => p.tables.inventoryBatches[0].remaining++,
    ]) {
      const p = structuredClone(original);
      mutate(p);
      await expect(restore(p, true)).rejects.toThrow();
      expect((await capture()).tables).toEqual(original.tables);
    }
  });
  it('keeps bounded automatic snapshots, deduplicates unchanged books and verifies snapshot integrity', async () => {
    await db.appSettings.update('main', { retention: 2 });
    await snapshot();
    await snapshot();
    expect(await db.snapshots.count()).toBe(1);
    await purchase(1, 1);
    await snapshot();
    await sale(1, 2);
    await snapshot();
    expect(await db.snapshots.count()).toBe(2);
    const s = (await db.snapshots.toArray())[0];
    await db.snapshots.update(s.id, { body: s.body + ' ' });
    await expect(loadSnapshot(s.id)).rejects.toThrow();
  });
  it('uses salted PIN derivation and rejects short backup passwords', async () => {
    const a = await pinHash('1234'),
      b = await pinHash('1234');
    expect(a).not.toBe(b);
    expect(await pinHash('1234', a.split('.')[0])).toBe(a);
    await expect(exportBackup('123')).rejects.toThrow();
  });
});

describe('reversals, migrations and archive integrity', () => {
  it('uses sequence as a deterministic FIFO tiebreaker within one multi-price purchase', async () => {
    await purchase(1, 5, {
      lines: [
        { productId: 'light', qty: 2, price: 40 },
        { productId: 'light', qty: 3, price: 70 },
        { productId: 'heavy', qty: 3, price: 85 },
      ],
    });
    const key = await sale(1, 1, {
      lines: [
        { productId: 'light', qty: 2, price: 100 },
        { productId: 'heavy', qty: 2, price: 150 },
      ],
      fee: 3,
      discount: 10,
      paid: 130,
    });
    const b = await trial();
    expect(b.sales.find((i) => i.id === key)).toMatchObject({ cost: 250, total: 493 });
    expect(stock(b, 'light').value).toBe(210);
    expect(stock(b, 'heavy').qty).toBe(1);
    expect(sum(b.saleItems, (i) => i.net)).toBe(493);
  });
  it('distinguishes owner opening stock from count gains/losses, never books a fictional supplier purchase', async () => {
    await adjustStock({
      productId: 'light',
      kind: 'openingStock',
      qty: 4,
      unitCost: 100,
      date: Date.now(),
      reason: 'مانده اول دوره',
    });
    await adjustStock({
      productId: 'light',
      kind: 'count',
      qty: 5,
      unitCost: 100,
      date: Date.now(),
      reason: 'مازاد',
    });
    await adjustStock({
      productId: 'light',
      kind: 'damage',
      qty: 2,
      unitCost: 0,
      date: Date.now(),
      reason: 'شکستگی',
    });
    const b = await trial();
    expect(summary(b)).toMatchObject({ gain: 100, loss: 200, profit: -100, purchases: 0 });
    expect(report(b, 'balanceSheet').rows.at(-1)?.[1]).toBe('۰');
  });
  it('reverses a settlement without deleting it, reopens the invoice and cannot reuse the cancelled receipt', async () => {
    const { reverseMoney } = await import('../src/core/engine');
    await purchase(3, 20);
    const inv = await sale(1, 100),
      p = await receipt(100);
    await reverseMoney(p, 'پرداخت اشتباه');
    expect(await walletBalance('cash')).toBe(0);
    expect(await invoiceDue((await db.salesInvoices.get(inv))!)).toBe(100);
    await expect(reverseMoney(p, 'تکرار')).rejects.toThrow();
    await expect(allocatePayment(p, [{ invoiceId: inv, amount: 1 }])).rejects.toThrow();
    await sale(1, 100);
    expect(await balance('customer', customer)).toBe(200);
    expect(await db.payments.count()).toBe(2);
    await trial();
  });
  it('requires dependent refunds to be reversed first and preserves their audit trail', async () => {
    const { reverseMoney } = await import('../src/core/engine');
    const p = await receipt(200);
    const r = await recordPayment({
      role: 'customer',
      partyId: customer,
      amount: 100,
      walletId: 'cash',
      refund: true,
      date: Date.now(),
    });
    await expect(reverseMoney(p, 'خطا')).rejects.toThrow();
    await reverseMoney(r, 'ابطال استرداد');
    await reverseMoney(p, 'ابطال دریافت');
    expect(await walletBalance('cash')).toBe(0);
    expect(await balance('customer', customer)).toBe(0);
    await trial();
  });
  it('reverses an expense and both sides of a transfer without changing original entries', async () => {
    const { reverseMoney } = await import('../src/core/engine');
    await funds(900);
    const e = await cashOperation({
      kind: 'expense',
      walletId: 'cash',
      amount: 200,
      date: Date.now(),
      reason: 'هزینه',
    });
    const tr = await cashOperation({
      kind: 'transfer',
      walletId: 'cash',
      toId: 'bank',
      amount: 200,
      date: Date.now(),
      reason: 'انتقال',
    });
    await reverseMoney(e, 'ابطال هزینه');
    await reverseMoney(tr, 'ابطال انتقال');
    expect(await walletBalance('bank')).toBe(0);
    expect(await walletBalance('cash')).toBe(900);
    expect(summary(await trial()).expense).toBe(0);
  });
  it('rejects a balanced-but-unrelated journal attached to a source invoice', async () => {
    await purchase(1, 20);
    await sale(1, 100);
    const p = await capture(),
      entry = p.tables.journalEntries.find((e) => e.type === 'sale');
    for (const l of p.tables.journalLines.filter((l) => l.entryId === entry.id)) {
      if (l.accountId === 'ar') l.debit += 10;
      if (l.accountId === 'sales') l.credit += 10;
    }
    expect(() => verify(p)).toThrow();
  });
  it('has a verified safety snapshot BEFORE confirmation and refuses a stale confirmation across tabs', async () => {
    const { prepareRestore } = await import('../src/core/backup');
    const p = await capture(),
      token = await prepareRestore(p);
    expect(await loadSnapshot(token.id)).toMatchObject({ schema: p.schema });
    await saveParty('customer', { name: 'ثبت هم‌زمان' });
    await expect(restore(p, true, token)).rejects.toThrow();
    expect(await db.customers.count()).toBe(2);
  });
  it('migrates version-2 portable data additively, preserving FIFO costs and original invoices', async () => {
    await purchase(2, 70);
    await sale(1, 100);
    const p = await capture();
    p.schema = 2;
    delete (p.tables as any).savedReports;
    for (const row of [...p.tables.inventoryBatches, ...p.tables.journalEntries])
      delete row.sequence;
    p.tables.accounts = p.tables.accounts.filter((a) => !['gains', 'losses'].includes(a.id));
    await restore(p, true);
    const b = await trial();
    expect(stock(b, 'light').value).toBe(70);
    expect(b.sales[0].cost).toBe(70);
    expect(await db.savedReports.count()).toBe(0);
  });
  it('preserves a saved historical report independently of subsequent postings', async () => {
    await purchase(2, 25);
    await sale(1, 100);
    const r = report(await readBook(), 'profit');
    const k = id();
    await atomic(k, 'report', r.title, () =>
      db.savedReports.add({
        ...r,
        id: k,
        kind: 'profit',
        from: 0,
        to: Date.now(),
        date: Date.now(),
        business: 'آزمون',
      }),
    );
    await sale(1, 200);
    const p = verify(await capture());
    expect(p.tables.savedReports[0].rows.at(-1)[1]).toBe('۷۵');
    expect(summary(await readBook()).profit).toBe(250);
  });
});
