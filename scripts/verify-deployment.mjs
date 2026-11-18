// Read-only verification. No business data is submitted, and the temporary browser profile starts empty.
import assert from 'node:assert/strict';
import { chromium, browserOptions } from '../tests/browser.mjs';
if (!process.env.APP_URL) throw Error('Set APP_URL to the exact deployed HTTPS origin.');
const site = new URL(process.env.APP_URL);
assert(
  site.protocol === 'https:' && !site.username && !site.password && site.pathname === '/',
  'Expected a stable HTTPS origin at its root',
);
const url = site.origin;
const home = await fetch(url + '/');
assert(home.ok);
const html = await home.text();
assert(html.includes('دانه‌حساب'));
for (const path of [
  '/customers',
  '/inventory/light',
  '/backup',
  '/sales',
  '/purchases',
  '/reports',
  '/ledger',
  '/cash',
]) {
  const r = await fetch(url + path);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), html);
  console.log('200 SPA fallback:', r.url);
}
const browser = await chromium.launch(await browserOptions());
try {
  const context = await browser.newContext(),
    page = await context.newPage();
  await page.goto(url + '/customers');
  await page.locator('h1').filter({ hasText: 'مدیریت مشتریان' }).waitFor();
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, {}, { timeout: 60000 });
  const manifest = await (await fetch(url + '/manifest.json')).json();
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.lang, 'fa');
  await context.setOffline(true);
  await page.goto(url + '/inventory/light');
  await page.getByRole('heading', { name: 'تخم‌مرغ سبک', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'تخم‌مرغ سبک', exact: true }).waitFor();
  console.log('Verified HTTPS deployment and offline route:', url);
} finally {
  await browser.close();
}
