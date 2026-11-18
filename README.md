# دانه‌حساب | Daneh Hesab

A Persian, RTL, offline-first **web application**, not an Android APK. The static host delivers program files; the user's browser owns the business database. There is no API backend, cloud account, telemetry, or financial-data upload. A fresh book contains the chart of accounts, two empty money accounts and three egg categories — **no demonstration transactions**.

## Run

Use Node.js 22.12 or later (Node 22 LTS recommended).

```sh
npm ci
npm run dev             # development UI; the production worker is deliberately disabled
npm test                # transactional accounting, inventory, migration and backup tests
npm run test:offline    # builds the real shell, then drives it in a persistent Chromium profile
npm run preview         # serve the production dist/ after building
npm run package:netlify # build dist/ and create release/daneh-hesab-netlify.zip
```

Use the **production build** to test installation or offline launch. Use HTTPS on a phone, or a loopback origin for desktop testing. Opening `index.html` as a file, or serving the development server over an insecure LAN address, is not an installation method.

## Guides and verification

- [راهنمای فارسی کاربر](docs/GUIDE.fa.md)
- [راهنمای نصب و آزمون روی اندروید](docs/ANDROID.fa.md)
- [پشتیبان‌گیری، بازیابی و انتقال گوشی](docs/BACKUP.fa.md)
- [Static Netlify deployment and exact-URL verification](docs/DEPLOYMENT.md)
- [Database, accounting rules and source map](docs/ARCHITECTURE.md)
- [Verification evidence and outstanding device/host checks](docs/VERIFICATION.md)

## What is included

- Mobile dashboard, responsive navigation, Jalali calendar controls, local Vazirmatn typeface, integer Toman and Persian numerals.
- Customer and supplier profiles, separate delivery information, signed opening balances, invoice/payment histories, outstanding invoices and printable statements.
- Multi-line purchases and sales, FIFO batches, opening stock, independent documented adjustments, count reconciliations, damage, partial returns and non-destructive reversals.
- Cash, multiple bank accounts, transfers, expenses, advances, multi-invoice allocations, refunds, daily cash reconciliation, double-entry journals, trial balance, balance sheet and P&L.
- Invoice snapshots with both signatures and attachments; local PDF creation, CSV, printing, sharing where supported, and saved historical reports.
- Authenticated encrypted portable backups, automatic local snapshots, retention, pre-restore safety copies, integrity verification, optional local management PIN and browser storage diagnostics.
- Versioned IndexedDB migrations, a content-verified service worker, a real manifest, regular/maskable icons, static-host routing and a reproducible deployment archive.

**Deployment status:** the production build has been tested with its origin server stopped and browser networking disabled. No public Netlify URL is claimed here. A live Netlify deployment and a physical Android home-screen installation require the external checks described in the guides.

> Use a stable production origin for real books. An Arena preview, another domain, a different browser or a different Chrome profile has its own storage. Always keep independent encrypted backups outside the browser.
