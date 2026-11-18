import Dexie, { type Table } from 'dexie';
import type {
  Account,
  Adjustment,
  Allocation,
  Audit,
  BackupLog,
  Batch,
  CashRow,
  Invoice,
  Item,
  Journal,
  Line,
  Media,
  Movement,
  Party,
  Payment,
  Product,
  ReturnRow,
  SavedReport,
  Settings,
  Wallet,
} from './model';
export const SCHEMA = 4;
export const baseStores = {
  customers: 'id,name,phone',
  suppliers: 'id,name,phone',
  products: 'id,name',
  inventoryBatches: 'id,productId,docId,date',
  stockMovements: 'id,productId,docId,date',
  salesInvoices: 'id,&number,partyId,date',
  salesInvoiceItems: 'id,invoiceId,productId',
  purchaseInvoices: 'id,&number,partyId,date',
  purchaseInvoiceItems: 'id,invoiceId,productId',
  payments: 'id,partyId,date,docId',
  paymentAllocations: 'id,paymentId,invoiceId',
  cashAccounts: 'id',
  bankAccounts: 'id',
  cashTransactions: 'id,walletId,docId,date',
  accounts: 'id',
  journalEntries: 'id,docId,date',
  journalLines: 'id,entryId,accountId,partyId,date',
  returns: 'id,invoiceId,date',
  adjustments: 'id,target,date',
  signatures: 'id,docId',
  attachments: 'id,docId',
  auditLogs: 'id,date,docId',
  appSettings: 'id',
  backupHistory: 'id,date',
};
export const stores = { ...baseStores, savedReports: 'id,date,kind' };
export type StoreName = keyof typeof stores;
export type Snapshot = {
  revision?: string;
  id: string;
  date: number;
  kind: 'auto' | 'safety';
  body: string;
  digest: string;
};
// Preserve the previous FIFO ordering when upgrading an existing book. No quantity or cost is recalculated.
export function sequenceRows<T extends { id: string; date: number; createdAt?: number }>(
  rows: T[],
) {
  return [...rows]
    .sort(
      (a, b) =>
        a.date - b.date || (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id),
    )
    .map((r, i) => ({ ...r, sequence: i + 1 }));
}
class Database extends Dexie {
  customers!: Table<Party, string>;
  suppliers!: Table<Party, string>;
  products!: Table<Product, string>;
  inventoryBatches!: Table<Batch, string>;
  stockMovements!: Table<Movement, string>;
  salesInvoices!: Table<Invoice, string>;
  salesInvoiceItems!: Table<Item, string>;
  purchaseInvoices!: Table<Invoice, string>;
  purchaseInvoiceItems!: Table<Item, string>;
  payments!: Table<Payment, string>;
  paymentAllocations!: Table<Allocation, string>;
  cashAccounts!: Table<Wallet, string>;
  bankAccounts!: Table<Wallet, string>;
  cashTransactions!: Table<CashRow, string>;
  accounts!: Table<Account, string>;
  journalEntries!: Table<Journal, string>;
  journalLines!: Table<Line, string>;
  returns!: Table<ReturnRow, string>;
  adjustments!: Table<Adjustment, string>;
  signatures!: Table<Media, string>;
  attachments!: Table<Media, string>;
  auditLogs!: Table<Audit, string>;
  appSettings!: Table<Settings, string>;
  backupHistory!: Table<BackupLog, string>;
  savedReports!: Table<SavedReport, string>;
  snapshots!: Table<Snapshot, string>;
  constructor() {
    super('DanehHesab');
    this.version(1).stores(baseStores);
    this.version(2).stores({
      snapshots: 'id,date,kind',
      journalLines: 'id,entryId,accountId,partyId,walletId,date',
    });
    this.version(3)
      .stores({
        inventoryBatches: 'id,productId,docId,date,&sequence',
        journalEntries: 'id,docId,date,&sequence',
        snapshots: 'id,date,kind,[kind+date]',
      })
      .upgrade(async (tx) => {
        for (const name of ['inventoryBatches', 'journalEntries']) {
          const table = tx.table(name);
          await table.bulkPut(sequenceRows(await table.toArray()));
        }
      });
    this.version(4).stores({ savedReports: stores.savedReports });
  }
}
export const db = new Database();
export const businessTables = Object.keys(stores) as StoreName[];
export const chart: Account[] = [
  ['cash', 'صندوق', 'asset'],
  ['bank', 'حساب‌های بانکی', 'asset'],
  ['ar', 'حساب‌های دریافتنی', 'asset'],
  ['ap', 'حساب‌های پرداختنی', 'liability'],
  ['inventory', 'موجودی کالا', 'asset'],
  ['sales', 'درآمد فروش', 'income'],
  ['cogs', 'بهای تمام‌شده', 'expense'],
  ['expenses', 'هزینه‌های عملیاتی', 'expense'],
  ['salesReturns', 'برگشت از فروش', 'expense'],
  ['purchaseReturns', 'برگشت از خرید', 'income'],
  ['discounts', 'تخفیفات فروش', 'expense'],
  ['equity', 'سرمایه مالک', 'equity'],
  ['gains', 'مازاد شمارش و سایر درآمدها', 'income'],
  ['losses', 'کسری شمارش و ضایعات', 'expense'],
].map(([id, name, group]) => ({ id, name, group: group as Account['group'] }));
export async function initialize() {
  await db.transaction(
    'rw',
    [db.accounts, db.products, db.cashAccounts, db.bankAccounts, db.appSettings],
    async () => {
      const existing = new Set(await db.accounts.toCollection().primaryKeys());
      await db.accounts.bulkAdd(chart.filter((a) => !existing.has(a.id)));
      if (await db.appSettings.get('main')) return;
      await db.products.bulkAdd(
        [
          ['light', 'تخم‌مرغ سبک', '۱۰ تا ۱۱ کیلوگرم', 'light'],
          ['standard', 'تخم‌مرغ استاندارد', '۱۱٫۵ تا ۱۲٫۵ کیلوگرم', 'standard'],
          ['heavy', 'تخم‌مرغ سنگین', '۱۳ کیلوگرم و بیشتر', 'heavy'],
        ].map(([id, name, weight, color]) => ({
          id,
          name,
          weight,
          color,
          createdAt: Date.now(),
          salePrice: 0,
        })),
      );
      await db.cashAccounts.add({ id: 'cash', name: 'صندوق نقدی' });
      await db.bankAccounts.add({ id: 'bank', name: 'بانک اصلی' });
      await db.appSettings.add({
        id: 'main',
        business: 'پخش تخم‌مرغ',
        logo: '',
        retention: 5,
        pin: '',
      });
    },
  );
}
export const parties = (role: 'customer' | 'supplier') =>
  role === 'customer' ? db.customers : db.suppliers;
export const documents = (side: 'sale' | 'purchase') =>
  side === 'sale' ? db.salesInvoices : db.purchaseInvoices;
export const items = (side: 'sale' | 'purchase') =>
  side === 'sale' ? db.salesInvoiceItems : db.purchaseInvoiceItems;
