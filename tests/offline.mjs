import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, browserOptions } from './browser.mjs';
const dist = new URL('../dist/', import.meta.url),
  root = dist.pathname,
  profile = await mkdtemp(join(tmpdir(), 'daneh-device-'));
assert.match(await readFile(join(root, '_redirects'), 'utf8'), /\/\*\s+\/index.html\s+200/);
const mime = {
  '.html': 'text/html;charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.png': 'image/png',
};
let port = 0,
  revision = 0,
  server,
  ctx,
  page;
const errors = [],
  external = new Set();
const launch = await browserOptions();
async function serve() {
  server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://test').pathname);
      assert(!path.includes('..'));
      let f = join(root, path);
      if (
        !(await stat(f)
          .then((s) => s.isFile())
          .catch(() => false))
      )
        f = join(root, 'index.html');
      let body = await readFile(f);
      if (path === '/sw.js' && revision)
        body = Buffer.from(
          body
            .toString()
            .replace(
              'daneh-shell-',
              revision === 1 ? 'daneh-shell-update-' : 'daneh-shell-broken-',
            ),
        );
      if (revision === 2 && path === '/images/summary.webp')
        body = Buffer.from('incomplete deployment');
      res.writeHead(200, {
        'Content-Type': mime[extname(f)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(body);
    } catch {
      res.writeHead(500);
      res.end();
    }
  });
  await new Promise((ok) => server.listen(port, '127.0.0.1', ok));
  port = server.address().port;
}
async function disconnect() {
  await ctx.setOffline(true);
  server.closeAllConnections();
  await new Promise((ok) => server.close(ok));
  server = null;
}
const origin = () => `http://127.0.0.1:${port}`;
async function launchDevice(offline = false) {
  ctx = await chromium.launchPersistentContext(profile, {
    ...launch,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    offline,
    acceptDownloads: true,
  });
  ctx.setDefaultTimeout(10000);
  await ctx.addInitScript(() => {
    delete window.showSaveFilePicker;
  });
  page = ctx.pages()[0] || (await ctx.newPage());
  page.on('pageerror', (e) => errors.push(e.message));
  ctx.on('request', (r) => {
    if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== origin()) external.add(r.url());
  });
}
const go = async (path) => {
  await page.goto(origin() + path);
  await page.locator('.main').waitFor();
};
const btn = (name) => page.getByRole('button', { name, exact: true });
const dialog = () => page.getByRole('dialog').last();
async function submit(button, confirmation = false) {
  await dialog().getByRole('button', { name: button, exact: true }).click();
  if (confirmation)
    await dialog().getByRole('button', { name: 'تأیید و ادامه', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}
async function tables(...names) {
  return page.evaluate(async (names) => {
    const db = await new Promise((ok, no) => {
      const r = indexedDB.open('DanehHesab');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
    });
    try {
      const out = {};
      const tx = db.transaction(names);
      await Promise.all(
        names.map(
          (n) =>
            new Promise((ok, no) => {
              const r = tx.objectStore(n).getAll();
              r.onsuccess = () => {
                out[n] = r.result;
                ok();
              };
              r.onerror = () => no(r.error);
            }),
        ),
      );
      return out;
    } finally {
      db.close();
    }
  }, names);
}
async function fileFrom(button) {
  const dl = page.waitForEvent('download');
  await btn(button).click();
  const result = await dl;
  return { bytes: await readFile(await result.path()), name: result.suggestedFilename() };
}
const ok = (msg) => console.log('PASS  ' + msg);
try {
  await serve();
  for (const path of ['/', '/customers', '/inventory/light', '/sales/some-document', '/settings']) {
    const r = await fetch(origin() + path);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /<div id="root">/);
  }
  ok('Static production shell + Netlify-style direct-route fallback');
  await launchDevice();
  await go('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.evaluate(() => document.fonts.ready);
  const sw = await page.evaluate(async () => {
    const c = await caches.open((await caches.keys()).find((k) => k.startsWith('daneh-shell-')));
    return (await c.keys()).map((r) => r.url);
  });
  assert(
    sw.some((s) => s.endsWith('woff2')) &&
      sw.some((s) => s.includes('jspdf')) &&
      sw.some((s) => s.endsWith('summary.webp')),
  );
  const manifest = await (await fetch(origin() + '/manifest.json')).json();
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  for (const icon of manifest.icons) {
    const size = await page.evaluate(async (url) => {
      const i = new Image();
      i.src = url;
      await i.decode();
      return i.naturalWidth;
    }, icon.src);
    assert.equal(size, Number(icon.sizes.split('x')[0]));
  }
  ok(
    'Activated worker, complete app shell (including lazy PDF code), valid manifest and real icon sizes',
  );
  const cdp = await ctx.newCDPSession(page);
  const appManifest = await cdp.send('Page.getAppManifest');
  assert.equal(appManifest.errors.length, 0);
  try {
    console.log(
      'Chromium installability diagnostics:',
      await cdp.send('Page.getInstallabilityErrors'),
    );
  } catch {
    console.log('Installability diagnostics unavailable in this browser build');
  }
  await disconnect();
  await go('/customers');
  await btn('مشتری جدید').click();
  await dialog().locator('[name=name]').fill('مشتری آفلاین');
  await dialog().locator('[name=address]').fill('فروشگاه محلی');
  await dialog().locator('[name=delivery]').fill('نشانی ماندگار');
  await dialog().locator('[name=phone]').fill('۰۹۱۲۱۲۳۴۵۶۷');
  await submit('ذخیره اطلاعات');
  await page.getByRole('link', { name: /مشتری آفلاین/ }).click();
  await btn('ویرایش مشخصات').click();
  await dialog().locator('[name=notes]').fill('ویرایش بدون اینترنت');
  await submit('ذخیره اطلاعات');
  await go('/suppliers');
  await btn('تأمین‌کننده جدید').click();
  await dialog().locator('[name=name]').fill('تأمین‌کننده آفلاین');
  await submit('ذخیره اطلاعات');
  ok('No server or network: create/edit customers, local delivery address and supplier');
  await go('/cash');
  await btn('مانده افتتاحیه').click();
  await dialog().getByLabel('مبلغ (تومان) *', { exact: true }).fill('۲۰۰۰');
  await dialog().locator('[name=reason]').fill('افتتاحیه');
  await submit('تأیید عملیات مالی', true);
  await go('/purchases');
  await btn('ثبت خرید جدید').click();
  await dialog()
    .getByRole('combobox', { name: 'تأمین‌کننده', exact: true })
    .selectOption({ label: 'تأمین‌کننده آفلاین' });
  await dialog().getByLabel('کالای ردیف ۱').selectOption('light');
  await dialog().getByLabel('تعداد کارتن', { exact: true }).fill('۴');
  await dialog().getByLabel('قیمت واحد (تومان)').fill('۱۰۰');
  await dialog().getByLabel('نوع تسویه').selectOption('full');
  await dialog().locator('.expand summary').click();
  await dialog()
    .locator('[name=attachment]')
    .setInputFiles({
      name: 'receipt.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\nReceipt\n%%EOF'),
    });
  await submit('بررسی و ثبت فاکتور', true);
  await page.locator('.invoice-paper').waitFor();
  await go('/sales');
  await btn('ثبت فروش جدید').click();
  await dialog()
    .getByRole('combobox', { name: 'مشتری', exact: true })
    .selectOption({ label: 'مشتری آفلاین' });
  await dialog().getByLabel('کالای ردیف ۱').selectOption('light');
  await dialog().getByLabel('تعداد کارتن', { exact: true }).fill('۲');
  await dialog().getByLabel('قیمت واحد (تومان)').fill('۲۵۰');
  await dialog().getByLabel('نوع تسویه').selectOption('partial');
  await dialog().getByLabel('مبلغ پرداخت (تومان)').fill('۲۰۰');
  await dialog().locator('.expand summary').click();
  const canvas = dialog().locator('canvas').first();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 8, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 65, box.y + 40, { steps: 4 });
  await page.mouse.up();
  await dialog()
    .locator('.signature input[type=file]')
    .last()
    .setInputFiles({
      name: 'signature.png',
      mimeType: 'image/png',
      buffer: await readFile(join(root, 'icons/192.png')),
    });
  await submit('بررسی و ثبت فاکتور', true);
  await page.locator('.invoice-paper').waitFor();
  const invoicePath = new URL(page.url()).pathname;
  let ledger = await tables(
    'salesInvoices',
    'journalLines',
    'inventoryBatches',
    'cashTransactions',
    'signatures',
    'attachments',
  );
  assert.equal(ledger.salesInvoices[0].total, 500);
  assert.equal(ledger.salesInvoices[0].cost, 200);
  assert.equal(ledger.inventoryBatches[0].remaining, 2);
  assert.equal(
    ledger.cashTransactions.reduce((s, r) => s + r.amount, 0),
    1800,
  );
  assert.equal(
    ledger.journalLines.reduce((s, r) => s + r.debit - r.credit, 0),
    0,
  );
  assert.equal(ledger.signatures.length, 2);
  assert.equal(ledger.attachments.length, 1);
  ok(
    'Offline purchase, sale, signatures, attachment, FIFO, partial receipt, stock and balanced journal',
  );
  const pdf = await fileFrom('ذخیره پی‌دی‌اف');
  assert(pdf.bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) && pdf.bytes.length > 10000);
  await go('/reports?view=ledger');
  const pdf2 = await fileFrom('خروجی پی‌دی‌اف');
  assert(pdf2.bytes.toString('ascii', 0, 5) === '%PDF-');
  const csv = await fileFrom('خروجی CSV');
  assert(csv.bytes.toString().includes('بدهکار'));
  ok(
    'Actual invoice PDF, report PDF and UTF-8 CSV downloads with the origin completely unavailable',
  );
  await go('/inventory/light');
  await btn('اصلاح موجودی').click();
  await dialog().getByLabel('تعداد واقعی شمارش‌شده').fill('۳');
  await dialog().locator('[name=reason]').fill('شمارش فیزیکی');
  await submit('ثبت اصلاح موجودی', true);
  await go('/cash');
  await btn('دریافت و پرداخت').click();
  await dialog().getByLabel('طرف حساب *', { exact: true }).selectOption({ label: 'مشتری آفلاین' });
  await dialog().locator('[name=amount]').fill('۵۰');
  await submit('ثبت پرداخت', true);
  await btn('ثبت هزینه').click();
  await dialog().getByLabel('مبلغ (تومان) *', { exact: true }).fill('۲۰');
  await dialog().locator('[name=reason]').fill('هزینه پخش');
  await submit('تأیید عملیات مالی', true);
  ledger = await tables('cashTransactions', 'journalLines', 'inventoryBatches');
  assert.equal(
    ledger.cashTransactions.reduce((s, r) => s + r.amount, 0),
    1830,
  );
  assert.equal(
    ledger.journalLines
      .filter((r) => r.accountId === 'ar')
      .reduce((s, r) => s + r.debit - r.credit, 0),
    250,
  );
  await page.reload();
  await page.getByRole('heading', { name: 'صندوق و بانک', exact: true }).waitFor();
  ok('Offline stocktake, receipt, expense and page refresh without loss');
  await go('/backup');
  await page.getByLabel('رمز فایل پشتیبان').fill('offline-backup-pass');
  await btn('ساخت فایل رمزنگاری‌شده').click();
  const backup = await fileFrom('ذخیره روی دستگاه');
  assert(!backup.bytes.toString().includes('مشتری آفلاین'));
  await go('/customers');
  await btn('مشتری جدید').click();
  await dialog().locator('[name=name]').fill('رکورد قبل بازیابی');
  await submit('ذخیره اطلاعات');
  await go('/backup');
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'archive.daneh',
      mimeType: 'application/octet-stream',
      buffer: backup.bytes,
    });
  await page.getByLabel('رمز فایل', { exact: true }).fill('offline-backup-pass');
  await btn('بررسی نسخه').click();
  await btn('تأیید بازیابی نسخه بررسی‌شده').click();
  await dialog().getByRole('button', { name: 'تأیید و ادامه' }).click();
  await page.getByText('بازیابی و کنترل یکپارچگی با موفقیت انجام شد.').waitFor();
  const restored = await tables('customers', 'snapshots', 'signatures', 'attachments');
  assert.equal(restored.customers.length, 1);
  assert.equal(restored.customers[0].delivery, 'نشانی ماندگار');
  assert(restored.snapshots.some((s) => s.kind === 'safety'));
  assert.equal(restored.signatures.length, 2);
  assert.equal(restored.attachments.length, 1);
  ok('Real encrypted file round-trip with explicit confirmation and before-restore safety copy');
  await ctx.close();
  ctx = null;
  await launchDevice(true);
  await go(invoicePath);
  await page.locator('.invoice-paper').waitFor();
  assert.equal((await tables('customers')).customers[0].notes, 'ویرایش بدون اینترنت');
  assert.equal((await tables('salesInvoices')).salesInvoices.length, 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  ok(
    'Cold browser-process restart, persistent profile, origin still down: historic invoice and addresses intact',
  );
  await serve();
  await ctx.setOffline(false);
  revision = 1;
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    await r.update();
  });
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.ready).waiting);
  await btn('به‌روزرسانی').click();
  await dialog().getByRole('button', { name: 'تأیید و ادامه' }).click();
  await page.waitForFunction(
    () => navigator.serviceWorker.controller && document.querySelector('.invoice-paper'),
  );
  await page.waitForFunction(async () =>
    (await caches.keys()).some((k) => k.includes('shell-update-')),
  );
  await go('/customers');
  assert.equal((await tables('customers')).customers[0].delivery, 'نشانی ماندگار');
  ok('Waiting-worker update only after consent; local business data preserved');
  revision = 2;
  const state = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    const settled = new Promise((ok) =>
      reg.addEventListener(
        'updatefound',
        () => {
          const w = reg.installing;
          w.addEventListener('statechange', () => {
            if (['redundant', 'installed'].includes(w.state)) ok(w.state);
          });
        },
        { once: true },
      ),
    );
    await reg.update();
    return settled;
  });
  assert.equal(state, 'redundant');
  await disconnect();
  await go('/');
  assert.equal((await tables('salesInvoices')).salesInvoices.length, 1);
  ok('Corrupt asset update rejected: last good shell and ledger still open offline');
  assert.deepEqual(errors, []);
  assert.deepEqual([...external], []);
  ok('No browser JS errors and no external runtime requests');
  console.log(
    'Device installation and production Netlify URL require separate real-device/hosting verification.',
  );
} catch (e) {
  if (page) {
    await mkdir('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/offline-failure.png' }).catch(() => {});
    console.error('Visible alert:', await page.locator('[role=alert]').allTextContents());
    console.error('Page errors:', errors);
  }
  throw e;
} finally {
  if (ctx) await ctx.close();
  if (server) {
    server.closeAllConnections();
    await new Promise((ok) => server.close(ok));
  }
  await rm(profile, { recursive: true, force: true });
}
