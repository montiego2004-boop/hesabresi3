export type Side = 'sale' | 'purchase';
export type Role = 'customer' | 'supplier';
export type Party = {
  id: string;
  name: string;
  phone: string;
  address: string;
  delivery: string;
  location: string;
  instructions: string;
  time: string;
  notes: string;
  createdAt: number;
};
export type Product = {
  id: string;
  name: string;
  weight: string;
  color: string;
  salePrice: number;
  createdAt: number;
};
export type Account = {
  id: string;
  name: string;
  group: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
};
export type Wallet = { id: string; name: string };
export type Batch = {
  sequence: number;
  id: string;
  productId: string;
  docId: string;
  date: number;
  createdAt: number;
  quantity: number;
  remaining: number;
  unitCost: number;
};
export type Lot = { batchId: string; qty: number; cost: number };
export type MoveKind =
  | 'purchase'
  | 'sale'
  | 'saleReturn'
  | 'purchaseReturn'
  | 'damage'
  | 'countUp'
  | 'countDown'
  | 'adjustUp'
  | 'adjustDown'
  | 'otherUp'
  | 'otherDown'
  | 'openingStock';
export type Movement = {
  id: string;
  docId: string;
  productId: string;
  kind: MoveKind;
  qty: number;
  date: number;
  reason: string;
  notes: string;
  lots: Lot[];
};
export type Invoice = {
  id: string;
  number: string;
  side: Side;
  partyId: string;
  party: Party;
  business: string;
  logo: string;
  date: number;
  createdAt: number;
  gross: number;
  discount: number;
  fee: number;
  total: number;
  cost: number;
  previous: number;
  paid: number;
  method: string;
  notes: string;
  status: 'posted' | 'reversed';
};
export type Item = {
  id: string;
  invoiceId: string;
  productId: string;
  name: string;
  qty: number;
  price: number;
  gross: number;
  net: number;
  cost: number;
  lots: Lot[];
};
export type Payment = {
  voidedBy?: string;
  reversalOf?: string;
  id: string;
  partyId: string;
  role: Role;
  date: number;
  amount: number;
  walletId: string;
  refund: boolean;
  description: string;
  docId: string;
};
export type Allocation = {
  id: string;
  paymentId: string;
  invoiceId: string;
  amount: number;
  date: number;
  target: 'invoice' | 'refund';
};
export type CashRow = {
  reversalOf?: string;
  sourceKind?: string;
  id: string;
  docId: string;
  walletId: string;
  kind: string;
  date: number;
  amount: number;
  description: string;
  partyId?: string;
};
export type Journal = {
  sequence: number;
  id: string;
  docId: string;
  date: number;
  type: string;
  description: string;
};
export type Line = {
  id: string;
  entryId: string;
  accountId: string;
  date: number;
  debit: number;
  credit: number;
  partyId?: string;
  walletId?: string;
};
export type ReturnRow = {
  id: string;
  invoiceId: string;
  date: number;
  side: Side;
  reason: string;
  total: number;
  cost: number;
  items: { itemId: string; qty: number; net: number; cost: number }[];
};
export type Adjustment = {
  id: string;
  target: string;
  date: number;
  before: number;
  actual: number;
  diff: number;
  kind: string;
  reason: string;
};
export type Media = { id: string; docId: string; name: string; data: string };
export type Settings = {
  id: string;
  business: string;
  logo: string;
  retention: number;
  pin: string;
};
export type Audit = { id: string; date: number; type: string; description: string; docId: string };
export type SavedReport = {
  id: string;
  date: number;
  kind: string;
  from: number;
  to: number;
  title: string;
  business: string;
  columns: string[];
  rows: string[][];
};
export type BackupLog = { id: string; date: number; kind: string; count: number };
export const labels: Record<string, string> = {
  sale: 'فروش',
  purchase: 'خرید',
  saleReturn: 'برگشت فروش',
  purchaseReturn: 'برگشت خرید',
  damage: 'ضایعات',
  openingStock: 'موجودی اول دوره',
  countUp: 'افزایش شمارش',
  countDown: 'کاهش شمارش',
  adjustUp: 'اصلاح افزایشی',
  adjustDown: 'اصلاح کاهشی',
  otherUp: 'ورود مستند',
  otherDown: 'خروج مستند',
  receipt: 'دریافت از مشتری',
  pay: 'پرداخت به تأمین‌کننده',
  customerRefund: 'استرداد به مشتری',
  supplierRefund: 'استرداد از تأمین‌کننده',
  expense: 'هزینه عملیاتی',
  deposit: 'واریز سرمایه',
  withdraw: 'برداشت مالک',
  transfer: 'انتقال بین حساب‌ها',
  opening: 'مانده افتتاحیه',
  closing: 'بستن صندوق',
  correction: 'اصلاح موجودی نقدی',
  reversal: 'سند ابطال',
  cashReversal: 'ابطال گردش نقدی',
  paymentReversal: 'ابطال تسویه',
  allocation: 'تخصیص پرداخت',
  customer: 'مشتری',
  supplier: 'تأمین‌کننده',
  product: 'دسته‌بندی',
  settings: 'تنظیمات',
  wallet: 'حساب بانکی',
  manual: 'خروجی رمزنگاری‌شده',
  restore: 'بازیابی',
  auto: 'تصویر خودکار',
  safety: 'نسخه ایمنی',
};
export const id = (): string => crypto.randomUUID();
export function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export function integer(n: number, min = 0) {
  check(Number.isSafeInteger(n) && n >= min, 'مقدار باید عدد صحیح و در محدوده مجاز باشد.');
  return n;
}
export function sum<T>(rows: T[], fn: (r: T) => number) {
  return rows.reduce((s, r) => integer(s + fn(r), Number.MIN_SAFE_INTEGER), 0);
}
export const fa = (n: number) =>
  new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(n === 0 ? 0 : n);
export const dateFa = (v: number, full = false) => {
  if (!full)
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(v);
  const parts = new Intl.DateTimeFormat('fa-IR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).formatToParts(v);
  const part = (name: string) => parts.find((p) => p.type === name)?.value;
  return `${part('weekday')}، ${part('day')} ${part('month')} ${part('year')}`;
};
export const norm = (s: string) =>
  s
    .replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
    .replace(/[ك]/g, 'ک')
    .replace(/[ي]/g, 'ی');
export function numberOf(v: FormDataEntryValue | string | null) {
  const t = norm(String(v ?? '')).replace(/[,٬\s]/g, '');
  check(t === '' || /^-?\d+$/.test(t), 'لطفاً عدد صحیح وارد کنید.');
  return integer(Number(t), Number.MIN_SAFE_INTEGER);
}
export function dayStart(t = Date.now()) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return +d;
}
export function isoDate(t = Date.now()) {
  const d = new Date(t);
  return new Date(t - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function inputDate(s: string) {
  check(/^\d{4}-\d{2}-\d{2}$/.test(s), 'تاریخ معتبر نیست.');
  const n = s === isoDate() ? Date.now() : +new Date(s + 'T12:00:00');
  check(Number.isFinite(n) && n <= Date.now(), 'تاریخ سند نمی‌تواند در آینده باشد.');
  return n;
}
