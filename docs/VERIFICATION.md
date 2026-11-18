# Verification record — 18 November 2026

## Executed against this implementation

`npm test` exercises 34 integration cases using real Dexie transactions over a disposable IndexedDB implementation. `npm run test:offline` builds the **production** Vite bundle and worker and drives a real Chromium browser at a 390 × 844 touch viewport. Tests create records only in isolated temporary profiles, never in a user's book.

| Area                                       | Evidence                                                                                                                                                                                                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer/supplier registration and editing | Contact fields, shop/delivery addresses and instructions survive a DB close/reopen. Browser UI registers both roles and edits a customer while offline.                                                                                                              |
| Purchase, sale and stock                   | Multiple products, different-price FIFO batches (including same-time tie breaking), immutable snapshots, shortage rejection, original-cost returns, opening stock, count up/down/equal, damage and authorized adjustments.                                           |
| Partial/multiple payments and advances     | Tests A–E, cash/bank separation, supplier prepayment and refund, receipt spread over invoices, multiple payments on one invoice, no reuse of reversed receipts.                                                                                                      |
| Cash                                       | Opening funds, owner deposit/withdrawal, expense, both transfer directions, physical closing, corrections and insufficient-funds rollback.                                                                                                                           |
| Documents and integrity                    | Original invoice preserved after full reversal, staged partial returns, duplicate-submit race, aborted multi-store transaction, per-journal debit/credit equality, ledger totals and stock/value reconciliation.                                                     |
| Reports                                    | Actual customer/category profit, P&L, balance sheet, dated valuation, general ledger, frozen historical report; offline PDF and CSV file contents checked.                                                                                                           |
| Backup                                     | Full export uses authenticated encryption; wrong password/tampering/schema mismatch/inconsistent references rejected. Confirmed restore retains signatures and attachments. Safety copy, stale-confirmation rejection, retention, checksum and v2 migration covered. |
| Static routing                             | Test origin serves built `dist/` with the declared Netlify-style catch-all. Home, direct nested routes and refresh return the shell. This is **not** a live Netlify deployment test.                                                                                 |
| PWA shell                                  | Chromium reports no manifest or installability errors; icon files decode at the declared sizes; JS, CSS, fonts, artwork and lazy PDF chunks are cached.                                                                                                              |
| Offline browser workflow                   | Browser networking disabled **and the HTTP server stopped**. Created/edited a customer, registered supplier, posted opening cash, purchase, sale, partial receipt, stock count and expense.                                                                          |
| Offline files                              | Drew one signature, imported another, kept a purchase attachment, downloaded real invoice/report PDFs and CSV, exported a `.daneh` file, selected it through the file input, decrypted, verified and restored it.                                                    |
| Cold start                                 | Closed the entire Chromium process, started a new process with the same persistent profile and no origin server, opened a nested historic invoice and recovered the saved delivery address and notes.                                                                |
| Updates                                    | Tested an installed waiting worker, explicit update approval, retained records and a deliberately incomplete subsequent release. The failed content check did not replace the working offline shell.                                                                 |
| Privacy                                    | No external HTTP(S) runtime requests or browser JavaScript errors during the tested flows.                                                                                                                                                                           |

### Required numerical examples

- **A:** 5,000,000 debt + 12,000,000 invoice − 7,000,000 receipt = **10,000,000 debt**.
- **B:** −2,000,000 credit + 5,000,000 invoice − 1,000,000 receipt = **2,000,000 debt**.
- **C:** 1,000,000 debt − 1,500,000 receipt = **500,000 credit**.
- **D:** Attempting to split an 80-Toman payment into 60 + 30 is rejected; **neither allocation commits**.
- **E:** Buying 3 cartons at 20 and 5 at 30, then selling 5 at 100 with 25 discount and 5 charges gives FIFO cost **120**, net sale **480**, gross profit **360**. Receipt **180** leaves AR **300**, cash **180**, and 3 cartons valued at **90**. Trial balance and balance sheet reconcile.

## Still requires the external environment

- **Physical Android installation and standalone launcher:** not verified on a physical device here. A headless browser's installability diagnostics do not prove Android installed an icon or hid its browser bars. Use [the real-device checklist](ANDROID.fa.md) and `npm run test:android` on an attached device. Test the actual OS file chooser and share sheet on that device as well.
- **Live Netlify route/HTTPS verification and deployed URL:** not performed. No authorized Netlify deployment is available in this environment. Publish using [the deployment guide](DEPLOYMENT.md), then run `npm run test:deployed` with its actual origin. Do not treat the local preview as a public Netlify URL.
- Storage grants, share targets, save dialogs, browser eviction and background execution are controlled by the browser/OS. The app detects availability, uses a download fallback and recommends independent backups rather than making permanence guarantees.
