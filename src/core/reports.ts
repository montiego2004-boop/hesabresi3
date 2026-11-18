import { db } from './db';
import { dateFa, dayStart, fa, labels, sum, type Invoice, type Role } from './model';
export async function readBook() {
  return db.transaction(
    'r',
    db.tables.filter((t) => !['snapshots', 'signatures', 'attachments'].includes(t.name)),
    async () => ({
      customers: await db.customers.toArray(),
      suppliers: await db.suppliers.toArray(),
      products: await db.products.toArray(),
      batches: await db.inventoryBatches.toArray(),
      moves: await db.stockMovements.orderBy('date').reverse().toArray(),
      sales: await db.salesInvoices.orderBy('date').reverse().toArray(),
      purchases: await db.purchaseInvoices.orderBy('date').reverse().toArray(),
      saleItems: await db.salesInvoiceItems.toArray(),
      purchaseItems: await db.purchaseInvoiceItems.toArray(),
      payments: await db.payments.orderBy('date').reverse().toArray(),
      allocations: await db.paymentAllocations.toArray(),
      wallets: [...(await db.cashAccounts.toArray()), ...(await db.bankAccounts.toArray())],
      cash: await db.cashTransactions.orderBy('date').reverse().toArray(),
      accounts: await db.accounts.toArray(),
      entries: await db.journalEntries.orderBy('date').reverse().toArray(),
      lines: await db.journalLines.toArray(),
      returns: await db.returns.toArray(),
      adjust: await db.adjustments.orderBy('date').reverse().toArray(),
      audit: await db.auditLogs.orderBy('date').reverse().toArray(),
      settings: (await db.appSettings.get('main'))!,
      history: await db.backupHistory.orderBy('date').reverse().toArray(),
    }),
  );
}
export type Book = Awaited<ReturnType<typeof readBook>>;
export function partyBalance(b: Book, role: Role, id: string, until = Infinity) {
  return sum(
    b.lines.filter(
      (l) =>
        l.partyId === id && l.accountId === (role === 'customer' ? 'ar' : 'ap') && l.date <= until,
    ),
    (l) => (l.debit - l.credit) * (role === 'customer' ? 1 : -1),
  );
}
export const walletTotal = (b: Book, id: string, until = Infinity) =>
  sum(
    b.cash.filter((t) => t.walletId === id && t.date <= until),
    (t) => t.amount,
  );
export function docDue(b: Book, i: Invoice) {
  return (
    i.total -
    sum(
      b.allocations.filter((a) => a.target === 'invoice' && a.invoiceId === i.id),
      (a) => a.amount,
    ) -
    sum(
      b.returns.filter((r) => r.invoiceId === i.id),
      (r) => r.total,
    )
  );
}
export function stock(b: Book, p: string) {
  const bs = b.batches.filter((x) => x.productId === p),
    m = b.moves.filter((x) => x.productId === p);
  const qty = sum(bs, (x) => x.remaining),
    value = sum(bs, (x) => x.remaining * x.unitCost);
  const q = (k: string) =>
    Math.abs(
      sum(
        m.filter((x) => x.kind === k),
        (x) => x.qty,
      ),
    );
  return {
    qty,
    value,
    average: qty ? Math.round(value / qty) : 0,
    purchased: q('purchase'),
    sold: q('sale'),
    saleReturn: q('saleReturn'),
    purchaseReturn: q('purchaseReturn'),
    damaged: q('damage'),
    movementQty: sum(m, (x) => x.qty),
  };
}
export function summary(b: Book, from = 0, to = Infinity) {
  const lines = b.lines.filter((l) => l.date >= from && l.date <= to);
  const net = (code: string) =>
    sum(
      lines.filter((l) => l.accountId === code),
      (l) => l.debit - l.credit,
    );
  const revenue = -net('sales') - net('salesReturns') - net('discounts'),
    cogs = net('cogs'),
    expense = net('expenses'),
    gain = -net('gains'),
    loss = net('losses');
  return {
    revenue,
    cogs,
    expense,
    gain,
    loss,
    gross: revenue - cogs,
    profit: revenue - cogs - expense + gain - loss,
    purchases:
      sum(
        b.purchases.filter((i) => i.date >= from && i.date <= to),
        (i) => i.total,
      ) -
      sum(
        b.returns.filter((r) => r.side === 'purchase' && r.date >= from && r.date <= to),
        (r) => r.total,
      ),
  };
}
export const reportKinds = {
  daily: 'فروش روزانه',
  weekly: 'فروش هفتگی',
  monthly: 'فروش ماهانه',
  yearly: 'فروش سالانه',
  customers: 'فروش به تفکیک مشتری',
  category: 'فروش به تفکیک کالا',
  invoiceProfit: 'سود هر فاکتور',
  purchases: 'دفتر خرید',
  debts: 'مطالبات مشتریان',
  credits: 'بستانکاری مشتریان',
  payables: 'مانده تأمین‌کنندگان',
  cashflow: 'جریان نقدی',
  wallets: 'مانده صندوق و بانک',
  expenses: 'هزینه‌های عملیاتی',
  valuation: 'ارزش موجودی',
  movements: 'گردش کالا',
  damage: 'ضایعات',
  returns: 'برگشت از خرید و فروش',
  profit: 'سود و زیان',
  trial: 'تراز آزمایشی',
  ledger: 'دفتر کل',
  balanceSheet: 'ترازنامه',
  discrepancy: 'مغایرت و شمارش',
};
export type ReportKey = keyof typeof reportKinds;
export type Report = { title: string; columns: string[]; rows: string[][] };
const bucket = (t: number, unit: string) => {
  if (unit === 'weekly') {
    const d = new Date(t);
    d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
    return 'هفته ' + dateFa(+d);
  }
  return dateFa(t).slice(0, unit === 'yearly' ? 4 : unit === 'monthly' ? 7 : undefined);
};
export function report(b: Book, key: ReportKey, from = 0, to = Infinity): Report {
  let columns: string[] = [],
    rows: string[][] = [];
  const within = (r: { date: number }) => r.date >= from && r.date <= to,
    lines = b.lines.filter(within),
    rtn = b.returns.filter(within),
    sl = b.sales.filter(within),
    s = summary(b, from, to);
  const group = new Map<string, [number, number]>();
  const add = (name: string, net: number, cost: number) => {
    const prev = group.get(name) || [0, 0];
    group.set(name, [prev[0] + net, prev[1] + cost]);
  };
  if (
    ['daily', 'weekly', 'monthly', 'yearly', 'customers', 'category', 'invoiceProfit'].includes(key)
  ) {
    const names = (i: Invoice, t: number) =>
      key === 'customers' ? i.partyId : key === 'invoiceProfit' ? i.number : bucket(t, key);
    for (const i of sl) {
      if (key === 'category') {
        for (const l of b.saleItems.filter((l) => l.invoiceId === i.id))
          add(l.productId, l.net, l.cost);
      } else add(names(i, i.date), i.total, i.cost);
    }
    for (const r of rtn.filter((r) => r.side === 'sale')) {
      const i = b.sales.find((i) => i.id === r.invoiceId)!;
      if (key === 'category') {
        for (const x of r.items)
          add(b.saleItems.find((l) => l.id === x.itemId)!.productId, -x.net, -x.cost);
      } else add(names(i, r.date), -r.total, -r.cost);
    }
    columns = [
      key === 'customers'
        ? 'مشتری'
        : key === 'category'
          ? 'کالا'
          : key === 'invoiceProfit'
            ? 'فاکتور'
            : 'دوره',
      'فروش خالص',
      'بهای تمام‌شده',
      'سود ناخالص',
    ];
    rows = [...group].map(([k, [v, c]]) => [
      key === 'customers'
        ? b.customers.find((p) => p.id === k)!.name
        : key === 'category'
          ? b.products.find((p) => p.id === k)!.name
          : k,
      fa(v),
      fa(c),
      fa(v - c),
    ]);
  } else if (key === 'purchases') {
    columns = ['فاکتور', 'تأمین‌کننده', 'تاریخ', 'مبلغ'];
    rows = b.purchases
      .filter(within)
      .map((i) => [i.number, i.party.name, dateFa(i.date), fa(i.total)]);
  } else if (['debts', 'credits', 'payables'].includes(key)) {
    const customer = key !== 'payables';
    columns = ['طرف حساب', 'شماره تماس', 'ماهیت مانده', 'مانده پایان بازه'];
    for (const p of customer ? b.customers : b.suppliers) {
      const v = partyBalance(b, customer ? 'customer' : 'supplier', p.id, to);
      if (key === 'credits' ? v < 0 : key === 'debts' ? v > 0 : v !== 0)
        rows.push([
          p.name,
          p.phone,
          v < 0 ? 'پیش‌پرداخت' : customer ? 'دریافتنی' : 'پرداختنی',
          fa(Math.abs(v)),
        ]);
    }
  } else if (key === 'cashflow') {
    columns = ['تاریخ', 'شرح', 'حساب', 'واریز', 'برداشت'];
    rows = b.cash
      .filter(within)
      .map((t) => [
        dateFa(t.date),
        t.description,
        b.wallets.find((w) => w.id === t.walletId)!.name,
        fa(Math.max(0, t.amount)),
        fa(Math.max(0, -t.amount)),
      ]);
  } else if (key === 'wallets') {
    columns = ['حساب', 'مانده آغاز بازه', 'مانده پایان بازه'];
    rows = b.wallets.map((w) => [
      w.name,
      fa(walletTotal(b, w.id, from - 1)),
      fa(walletTotal(b, w.id, to)),
    ]);
  } else if (key === 'expenses') {
    columns = ['تاریخ', 'شرح', 'هزینه'];
    rows = lines
      .filter((l) => l.accountId === 'expenses')
      .map((l) => [
        dateFa(l.date),
        b.entries.find((e) => e.id === l.entryId)!.description,
        fa(l.debit - l.credit),
      ]);
  } else if (key === 'valuation') {
    columns = ['دسته‌بندی', 'مانده کارتن', 'ارزش در پایان بازه'];
    rows = b.products.map((p) => {
      const m = b.moves.filter((x) => x.productId === p.id && x.date <= to);
      return [
        p.name,
        fa(sum(m, (x) => x.qty)),
        fa(sum(m, (x) => Math.sign(x.qty) * sum(x.lots, (l) => l.cost * l.qty))),
      ];
    });
  } else if (key === 'movements' || key === 'damage') {
    columns = ['تاریخ', 'کالا', 'گردش', 'کارتن', 'دلیل'];
    rows = b.moves
      .filter(within)
      .filter((m) => key === 'movements' || m.kind === 'damage')
      .map((m) => [
        dateFa(m.date),
        b.products.find((p) => p.id === m.productId)!.name,
        labels[m.kind],
        fa(m.qty),
        m.reason,
      ]);
  } else if (key === 'returns') {
    columns = ['تاریخ', 'نوع', 'فاکتور', 'مبلغ', 'دلیل'];
    rows = rtn.map((r) => [
      dateFa(r.date),
      labels[r.side + 'Return'],
      [...b.sales, ...b.purchases].find((i) => i.id === r.invoiceId)!.number,
      fa(r.total),
      r.reason,
    ]);
  } else if (key === 'profit') {
    columns = ['عنوان', 'مبلغ (تومان)'];
    rows = [
      ['فروش خالص', fa(s.revenue)],
      ['بهای تمام‌شده', fa(s.cogs)],
      ['سود ناخالص', fa(s.gross)],
      ['هزینه‌های عملیاتی', fa(s.expense)],
      ['کسری شمارش و ضایعات', fa(s.loss)],
      ['مازاد و سایر درآمدها', fa(s.gain)],
      ['سود خالص', fa(s.profit)],
    ];
  } else if (key === 'trial') {
    columns = ['حساب', 'گردش بدهکار', 'گردش بستانکار', 'مانده بدهکار', 'مانده بستانکار'];
    rows = b.accounts.map((a) => {
      const l = lines.filter((r) => r.accountId === a.id),
        v = sum(
          b.lines.filter((r) => r.accountId === a.id && r.date <= to),
          (r) => r.debit - r.credit,
        );
      return [
        a.name,
        fa(sum(l, (r) => r.debit)),
        fa(sum(l, (r) => r.credit)),
        fa(Math.max(0, v)),
        fa(Math.max(0, -v)),
      ];
    });
  } else if (key === 'balanceSheet') {
    const net = (code: string) =>
      sum(
        b.lines.filter((l) => l.accountId === code && l.date <= to),
        (l) => l.debit - l.credit,
      );
    const ar = b.customers.map((p) => partyBalance(b, 'customer', p.id, to)),
      ap = b.suppliers.map((p) => partyBalance(b, 'supplier', p.id, to));
    const assets =
        net('cash') +
        net('bank') +
        net('inventory') +
        sum(ar, (x) => Math.max(0, x)) +
        sum(ap, (x) => Math.max(0, -x)),
      liab = sum(ap, (x) => Math.max(0, x)) + sum(ar, (x) => Math.max(0, -x)),
      equity = -net('equity') + summary(b, 0, to).profit;
    columns = ['عنوان', 'مانده پایان بازه'];
    rows = [
      ['دارایی‌ها', fa(assets)],
      ['بدهی‌ها', fa(liab)],
      ['حقوق مالکانه با سود انباشته', fa(equity)],
      ['اختلاف تراز', fa(assets - liab - equity)],
    ];
  } else if (key === 'ledger') {
    columns = ['تاریخ', 'شرح سند', 'حساب', 'بدهکار', 'بستانکار'];
    rows = lines
      .sort((a, b) => b.date - a.date)
      .map((l) => [
        dateFa(l.date),
        b.entries.find((e) => e.id === l.entryId)!.description,
        b.accounts.find((a) => a.id === l.accountId)!.name,
        fa(l.debit),
        fa(l.credit),
      ]);
  } else {
    columns = ['تاریخ', 'شرح', 'مانده سیستم', 'شمارش واقعی', 'اختلاف'];
    rows = b.adjust
      .filter(within)
      .map((a) => [dateFa(a.date), a.reason, fa(a.before), fa(a.actual), fa(a.diff)]);
  }
  return { title: reportKinds[key], columns, rows };
}
export function todayCash(b: Book) {
  const start = dayStart(),
    cash = b.cash.filter((r) => r.date >= start && r.walletId === 'cash');
  return {
    in: sum(cash, (r) => Math.max(0, r.amount)),
    out: sum(cash, (r) => Math.max(0, -r.amount)),
    expenses: sum(
      cash.filter((r) => r.kind === 'expense' || r.sourceKind === 'expense'),
      (r) => -r.amount,
    ),
  };
}

export function transactionAmount(b: Book, e: Book['entries'][number]) {
  if (e.type === 'sale' || e.type === 'purchase')
    return (e.type === 'sale' ? b.sales : b.purchases).find((i) => i.id === e.docId)!.total;
  const ret = b.returns.find((r) => r.id === e.docId);
  if (ret) return ret.total;
  return sum(
    b.lines.filter((l) => l.entryId === e.id),
    (l) => l.debit,
  );
}
