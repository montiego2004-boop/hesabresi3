import Dexie from 'dexie';
import { businessTables, chart, db, SCHEMA, sequenceRows, type StoreName } from './db';
import { reconcileSources } from './integrity';
import { validateMedia } from './media';
import { check, id, integer, sum } from './model';
// A portable snapshot deliberately excludes the snapshot store to avoid recursive backups.
export type Payload = {
  app: 'daneh-hesab';
  schema: number;
  date: number;
  tables: Record<StoreName, any[]>;
};
const enc = new TextEncoder(),
  dec = new TextDecoder();
const hex = (a: ArrayBuffer) =>
  Array.from(new Uint8Array(a), (b) => b.toString(16).padStart(2, '0')).join('');
const digest = async (s: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const b64 = (a: ArrayBuffer | Uint8Array) => {
  const bytes = new Uint8Array(a);
  let text = '';
  for (let i = 0; i < bytes.length; i += 32768)
    text += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(text);
};
const un64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const nRecords = (p: Payload) => sum(Object.values(p.tables), (t) => t.length);
async function collect(): Promise<Payload> {
  const tables = {} as Payload['tables'];
  for (const name of businessTables) tables[name] = await db.table(name).toArray();
  return { app: 'daneh-hesab', schema: SCHEMA, date: Date.now(), tables };
}
export const capture = () =>
  db.transaction(
    'r',
    businessTables.map((n) => db.table(n)),
    collect,
  );
export function verify(p: Payload) {
  const valid = (v: unknown) => check(v, 'ساختار یا یکپارچگی اطلاعات نسخه پشتیبان معتبر نیست.');
  if (p?.app === 'daneh-hesab' && p.schema === 2) {
    valid(Array.isArray(p.tables?.inventoryBatches) && Array.isArray(p.tables?.journalEntries));
    p = {
      ...p,
      schema: 3,
      tables: {
        ...p.tables,
        accounts: [
          ...p.tables.accounts,
          ...chart.filter(
            (a) =>
              ['gains', 'losses'].includes(a.id) && !p.tables.accounts.some((x) => x.id === a.id),
          ),
        ],
        inventoryBatches: sequenceRows(p.tables.inventoryBatches),
        journalEntries: sequenceRows(p.tables.journalEntries),
      },
    };
  }
  if (p?.app === 'daneh-hesab' && p.schema === 3 && p.tables)
    p = { ...p, schema: 4, tables: { ...p.tables, savedReports: p.tables.savedReports || [] } };
  valid(
    p && p.app === 'daneh-hesab' && p.schema === SCHEMA && p.tables && Number.isSafeInteger(p.date),
  );
  const t = p.tables,
    sets = {} as Record<StoreName, Set<string>>;
  for (const n of businessTables) {
    valid(Array.isArray(t[n]));
    sets[n] = new Set();
    for (const r of t[n]) {
      valid(r && typeof r.id === 'string' && r.id.length > 0 && !sets[n].has(r.id));
      sets[n].add(r.id);
      if ('date' in r) integer(r.date, 1);
    }
  }
  valid(Object.keys(t).length === businessTables.length);
  const has = (n: StoreName, k: string) => sets[n].has(k);
  const wallet = (w: string) => has('cashAccounts', w) || has('bankAccounts', w);
  valid(
    t.appSettings.length === 1 &&
      has('appSettings', 'main') &&
      has('cashAccounts', 'cash') &&
      has('bankAccounts', 'bank') &&
      chart.every((a) => has('accounts', a.id)),
  );
  const settings = t.appSettings[0];
  valid(
    typeof settings.business === 'string' &&
      settings.business.trim() &&
      typeof settings.pin === 'string' &&
      (!settings.pin || /^[A-Za-z0-9+/]{22}==\.[a-f0-9]{64}$/.test(settings.pin)) &&
      Number.isInteger(settings.retention) &&
      settings.retention >= 1 &&
      settings.retention <= 30,
  );
  valid(typeof settings.logo === 'string');
  if (settings.logo) validateMedia(settings.logo, true);
  for (const k of ['light', 'standard', 'heavy']) valid(has('products', k));
  for (const a of [...t.accounts, ...t.cashAccounts, ...t.bankAccounts])
    valid(typeof a.name === 'string' && a.name.trim());
  for (const x of [...t.customers, ...t.suppliers]) {
    for (const k of [
      'name',
      'phone',
      'address',
      'delivery',
      'location',
      'instructions',
      'time',
      'notes',
    ])
      valid(typeof x[k] === 'string');
    valid(x.name.trim());
  }
  for (const r of t.products) {
    valid(typeof r.name === 'string' && typeof r.weight === 'string');
    integer(r.salePrice);
  }
  const invs = [...t.salesInvoices, ...t.purchaseInvoices],
    invMap = new Map(invs.map((i) => [i.id, i]));
  const lines = [...t.salesInvoiceItems, ...t.purchaseInvoiceItems];
  const itemMap = new Map(lines.map((i) => [i.id, i]));
  valid(new Set(invs.map((i) => i.number)).size === invs.length);
  for (const i of invs) {
    valid(typeof i.logo === 'string');
    if (i.logo) validateMedia(i.logo, true);
    const sale = i.side === 'sale';
    valid(
      (sale || i.side === 'purchase') &&
        has(sale ? 'customers' : 'suppliers', i.partyId) &&
        i.party?.id === i.partyId &&
        typeof i.party.name === 'string' &&
        ['posted', 'reversed'].includes(i.status),
    );
    for (const k of ['total', 'gross', 'fee', 'discount', 'paid', 'cost']) integer(i[k]);
    integer(i.previous, Number.MIN_SAFE_INTEGER);
    valid(i.total === i.gross + i.fee - i.discount);
    const its = lines.filter((l) => l.invoiceId === i.id);
    valid(
      its.length &&
        sum(its, (l) => l.gross) === i.gross &&
        sum(its, (l) => l.net) === i.total &&
        sum(its, (l) => l.cost) === i.cost,
    );
  }
  for (const r of lines) {
    valid(invMap.has(r.invoiceId) && has('products', r.productId));
    integer(r.qty, 1);
    integer(r.price, 1);
    valid(
      r.qty * r.price === r.gross &&
        Array.isArray(r.lots) &&
        sum(r.lots, (l: any) => l.qty) === r.qty,
    );
    for (const l of r.lots) valid(has('inventoryBatches', l.batchId));
  }
  const batchMoves = new Map<string, number>(),
    bs = new Map(t.inventoryBatches.map((b) => [b.id, b]));
  for (const m of t.stockMovements) {
    valid(
      has('products', m.productId) &&
        Number.isSafeInteger(m.qty) &&
        m.qty &&
        Array.isArray(m.lots) &&
        sum(m.lots, (l: any) => l.qty) === Math.abs(m.qty),
    );
    for (const l of m.lots) {
      const b = bs.get(l.batchId);
      valid(b && b.productId === m.productId && b.unitCost === l.cost);
      integer(l.qty, 1);
      batchMoves.set(b.id, (batchMoves.get(b.id) || 0) + Math.sign(m.qty) * l.qty);
    }
  }
  for (const b of t.inventoryBatches) {
    valid(has('products', b.productId));
    integer(b.quantity, 1);
    integer(b.remaining);
    integer(b.unitCost);
    valid(b.remaining <= b.quantity && b.remaining === (batchMoves.get(b.id) || 0));
  }
  const totals = new Map<string, number>(),
    accountNet = new Map<string, number>(),
    walletNet = new Map<string, number>();
  for (const l of t.journalLines) {
    valid(has('journalEntries', l.entryId) && has('accounts', l.accountId));
    integer(l.debit);
    integer(l.credit);
    valid(!(l.debit && l.credit));
    if (l.accountId === 'ar') valid(has('customers', l.partyId));
    if (l.accountId === 'ap') valid(has('suppliers', l.partyId));
    if (['cash', 'bank'].includes(l.accountId)) valid(wallet(l.walletId));
    const delta = l.debit - l.credit;
    totals.set(l.entryId, (totals.get(l.entryId) || 0) + delta);
    accountNet.set(l.accountId, (accountNet.get(l.accountId) || 0) + delta);
    if (l.walletId) walletNet.set(l.walletId, (walletNet.get(l.walletId) || 0) + delta);
  }
  valid([...totals.values()].every((x) => x === 0));
  valid(
    (accountNet.get('inventory') || 0) === sum(t.inventoryBatches, (b) => b.unitCost * b.remaining),
  );
  for (const r of t.cashTransactions) {
    valid(wallet(r.walletId));
    integer(r.amount, Number.MIN_SAFE_INTEGER);
  }
  for (const w of [...t.cashAccounts, ...t.bankAccounts])
    valid(
      sum(
        t.cashTransactions.filter((r) => r.walletId === w.id),
        (r) => r.amount,
      ) === (walletNet.get(w.id) || 0),
    );
  for (const r of t.returns) {
    const i = invMap.get(r.invoiceId);
    valid(i && i.side === r.side && Array.isArray(r.items));
    integer(r.total);
    integer(r.cost);
    valid(sum(r.items, (x: any) => x.net) === r.total);
    for (const x of r.items) {
      valid(itemMap.get(x.itemId)?.invoiceId === r.invoiceId);
      integer(x.qty, 1);
      integer(x.net);
      integer(x.cost);
    }
  }
  for (const l of lines)
    valid(
      sum(
        t.returns.flatMap((r) => r.items).filter((x) => x.itemId === l.id),
        (x) => x.qty,
      ) <= l.qty,
    );
  const pays = new Map(t.payments.map((p) => [p.id, p]));
  for (const a of t.paymentAllocations) {
    const pay = pays.get(a.paymentId),
      target = a.target === 'invoice' ? invMap.get(a.invoiceId) : pays.get(a.invoiceId);
    valid(
      pay &&
        !pay.refund &&
        target &&
        target.partyId === pay.partyId &&
        ['refund', 'invoice'].includes(a.target),
    );
    valid(
      a.target === 'refund'
        ? target.refund
        : target.side === (pay.role === 'customer' ? 'sale' : 'purchase'),
    );
    integer(a.amount, Number.MIN_SAFE_INTEGER);
  }
  for (const p of t.payments) {
    valid(wallet(p.walletId) && has(p.role === 'customer' ? 'customers' : 'suppliers', p.partyId));
    integer(p.amount, 1);
    const v = sum(
      t.paymentAllocations.filter((a) => a.paymentId === p.id),
      (a) => a.amount,
    );
    valid(v >= 0 && v <= p.amount);
  }
  for (const i of invs) {
    const a = sum(
      t.paymentAllocations.filter((a) => a.target === 'invoice' && a.invoiceId === i.id),
      (a) => a.amount,
    );
    valid(
      a >= 0 &&
        a +
          sum(
            t.returns.filter((r) => r.invoiceId === i.id),
            (r) => r.total,
          ) <=
          i.total,
    );
  }
  for (const m of [...t.signatures, ...t.attachments]) {
    valid(invMap.has(m.docId) && typeof m.name === 'string');
    if (has('signatures', m.id)) valid(['buyer', 'seller'].includes(m.name));
    validateMedia(m.data, has('signatures', m.id));
  }
  for (const r of t.savedReports) {
    valid(
      typeof r.title === 'string' &&
        typeof r.business === 'string' &&
        typeof r.kind === 'string' &&
        Array.isArray(r.columns) &&
        r.columns.every((v: unknown) => typeof v === 'string') &&
        Array.isArray(r.rows) &&
        r.rows.every(
          (row: unknown) =>
            Array.isArray(row) &&
            row.length === r.columns.length &&
            row.every((v) => typeof v === 'string'),
        ),
    );
    integer(r.from);
    integer(r.to);
    valid(r.from <= r.to);
  }
  reconcileSources(t);
  return p;
}
async function keyFor(password: string, salt: Uint8Array<ArrayBuffer>, usage: KeyUsage[]) {
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    usage,
  );
}
export async function exportBackup(password: string) {
  check(password.length >= 8, 'رمز پشتیبان باید حداقل ۸ نویسه باشد.');
  const p = verify(await capture()),
    salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = enc.encode(JSON.stringify(p));
  check(
    4 * Math.ceil((plaintext.length + 16) / 3) + 1024 < 256 * 1024 * 1024,
    'حجم فایل از سقف ۲۵۶ مگابایت این نسخه بیشتر است.',
  );
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode('daneh-backup-v1') },
    await keyFor(password, salt, ['encrypt']),
    plaintext,
  );
  const text = JSON.stringify({
    format: 'daneh-backup',
    version: 1,
    kdf: 'PBKDF2-SHA256',
    rounds: 210000,
    algorithm: 'AES-256-GCM',
    salt: b64(salt),
    iv: b64(iv),
    cipher: b64(cipher),
  });
  return { text, count: nRecords(p) };
}
export async function importBackup(text: string, password: string) {
  check(text.length < 256 * 1024 * 1024, 'فایل برای حافظه مرورگر بیش از حد بزرگ است.');
  let x;
  try {
    x = JSON.parse(text);
  } catch {
    throw Error('فایل پشتیبان خوانا نیست.');
  }
  check(
    x?.format === 'daneh-backup' &&
      x.version === 1 &&
      x.rounds === 210000 &&
      x.algorithm === 'AES-256-GCM' &&
      x.kdf === 'PBKDF2-SHA256',
    'قالب یا نسخه پشتیبان پشتیبانی نمی‌شود.',
  );
  let p;
  try {
    const iv = un64(x.iv),
      salt = un64(x.salt);
    check(iv.length === 12 && salt.length === 16, '');
    const raw = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: enc.encode('daneh-backup-v1') },
      await keyFor(password, salt, ['decrypt']),
      un64(x.cipher),
    );
    p = JSON.parse(dec.decode(raw));
  } catch {
    throw Error('رمز اشتباه است یا فایل دستکاری شده است.');
  }
  return verify(p);
}
export type SafetyToken = { id: string; revision: string; date: number; count: number };
async function safetyCopy(): Promise<SafetyToken> {
  const stamp = await revision(),
    old = await collect(),
    body = JSON.stringify(old),
    key = id(),
    date = Date.now(),
    count = nRecords(old);
  await db.snapshots.add({
    id: key,
    date,
    kind: 'safety',
    body,
    revision: stamp,
    digest: await Dexie.waitFor(digest(body)),
  });
  await db.backupHistory.add({ id: key, date, kind: 'safety', count });
  return { id: key, revision: stamp, date, count };
}
// The UI calls this before displaying the destructive confirmation. Standalone API use also creates a safety copy.
export async function prepareRestore(p: Payload) {
  verify(p);
  return db.transaction('rw', db.tables, safetyCopy);
}
export async function restore(p: Payload, confirmed: boolean, prepared?: SafetyToken) {
  check(confirmed, 'بازیابی نیازمند تأیید صریح شماست.');
  p = verify(p);
  await db.transaction('rw', db.tables, async () => {
    const safety = prepared || (await safetyCopy());
    if (prepared) {
      const local = await db.snapshots.get(safety.id);
      check(
        local?.kind === 'safety' &&
          local.revision === safety.revision &&
          (await revision()) === safety.revision,
        'اطلاعات دفتر تغییر کرده است. نسخه را دوباره بررسی و بازیابی را تأیید کنید.',
      );
      check(
        local.digest === (await Dexie.waitFor(digest(local.body))),
        'نسخه ایمنی معتبر نیست؛ بازیابی متوقف شد.',
      );
    }
    for (const table of businessTables) {
      await db.table(table).clear();
      await db.table(table).bulkAdd(p.tables[table]);
    }
    verify(await collect());
    const date = Date.now();
    await db.backupHistory.put({
      id: safety.id,
      date: safety.date,
      kind: 'safety',
      count: safety.count,
    });
    await db.backupHistory.add({ id: id(), date, kind: 'restore', count: nRecords(p) });
    await db.auditLogs.add({
      id: id(),
      date,
      type: 'restore',
      docId: safety.id,
      description: 'بازیابی تأییدشده با نسخه ایمنی',
    });
  });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('daneh-commit'));
}
async function revision() {
  const last = await db.auditLogs.orderBy('date').last();
  return `${await db.auditLogs.count()}:${last?.id || 'empty'}`;
}
const autos = () =>
  db.snapshots
    .where('[kind+date]')
    .between(['auto', 0], ['auto', Number.MAX_SAFE_INTEGER], true, true);
export async function snapshot() {
  // Read consistently, then serialize and hash outside a write lock. Discard stale work if another tab posted meanwhile.
  const captured = await db.transaction('r', db.tables, async () => {
    const stamp = await revision();
    if ((await autos().last())?.revision === stamp) return null;
    return { stamp, p: await collect() };
  });
  if (!captured) return;
  const { p, stamp } = captured,
    body = JSON.stringify(p),
    checksum = await digest(body);
  await db.transaction(
    'rw',
    [db.snapshots, db.backupHistory, db.auditLogs, db.appSettings],
    async () => {
      if (stamp !== (await revision()) || (await autos().last())?.revision === stamp) return;
      const key = id();
      await db.snapshots.add({
        id: key,
        body,
        date: p.date,
        kind: 'auto',
        digest: checksum,
        revision: stamp,
      });
      await db.backupHistory.add({ id: key, date: p.date, kind: 'auto', count: nRecords(p) });
      const keep = (await db.appSettings.get('main'))!.retention,
        keys = await autos().primaryKeys();
      await db.snapshots.bulkDelete(keys.slice(0, Math.max(0, keys.length - keep)));
    },
  );
}
export async function loadSnapshot(key: string) {
  const s = await db.snapshots.get(key);
  check(s && s.digest === (await digest(s.body)), 'تصویر محلی آسیب دیده یا در دسترس نیست.');
  return verify(JSON.parse(s.body));
}
export async function pinHash(pin: string, salt = b64(crypto.getRandomValues(new Uint8Array(16)))) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: un64(salt), hash: 'SHA-256', iterations: 210000 },
    key,
    256,
  );
  return salt + '.' + hex(hash);
}
export function scheduleSnapshots(onError: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const enqueue = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const go = () => snapshot().catch(onError);
      if ('requestIdleCallback' in window) window.requestIdleCallback(go, { timeout: 4500 });
      else void go();
    }, 1200);
  };
  enqueue();
  window.addEventListener('daneh-commit', enqueue);
  return () => {
    clearTimeout(timer);
    window.removeEventListener('daneh-commit', enqueue);
  };
}
