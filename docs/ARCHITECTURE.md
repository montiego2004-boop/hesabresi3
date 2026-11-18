# Architecture and financial invariants

## Boundaries

The browser is the entire business runtime. React views call local commands, Dexie runs IndexedDB transactions, and `dexie-react-hooks` refreshes the read model after commit (including changes from another tab). All essential libraries, fonts, icons, art and the PDF chunk are built into the site. Netlify has no business API to receive a customer or invoice.

| Responsibility                                                              | Source                                                   |
| --------------------------------------------------------------------------- | -------------------------------------------------------- |
| Typed records, integer/date/format helpers                                  | `src/core/model.ts`                                      |
| Stores, indexes, schema upgrades and opening chart                          | `src/core/db.ts`                                         |
| Atomic posting, balanced journal validation, subledger balances             | `src/core/ledger.ts`                                     |
| Parties, bank accounts and category editing                                 | `src/core/directory.ts`                                  |
| Batch receipt, deterministic FIFO consumption, adjustments                  | `src/core/inventory.ts`                                  |
| Multi-line documents, historical snapshots, partial/full returns            | `src/core/invoices.ts`                                   |
| Receipts, supplier settlements, refunds and allocations                     | `src/core/payments.ts`                                   |
| Cash movements, transfers, count/closing and correcting entries             | `src/core/cash.ts`                                       |
| Public command API                                                          | `src/core/engine.ts`                                     |
| Ledger-based read model, P&L, trial balance, valuation, dated reports       | `src/core/reports.ts`                                    |
| Media validation, Persian paginated PDFs, CSV and local file delivery       | `src/core/media.ts`, `src/core/files.ts`                 |
| Portable authenticated backup, snapshots, restore and source reconciliation | `src/core/backup.ts`, `src/core/integrity.ts`            |
| Accessible Persian screens and modal workflows                              | `src/pages/`, `src/ui/`, `src/App.tsx`                   |
| Integrity-checked shell, install/update lifecycle                           | `src/pwa/sw.js`, `scripts/build-sw.mjs`, `src/ui/pwa.ts` |

## Storage and migration

`DanehHesab` is a versioned database. Version 1 establishes document and ledger stores; v2 adds local snapshots and the wallet index; v3 preserves prior batch order while adding stable posting sequence and snapshot-retention indexes; v4 adds saved reports. Migrations are additive. Stable UUID primary keys, unique document numbers, typed references and transactional validation protect relations. `sequence` breaks same-timestamp FIFO ties. Upgrading never opens a new empty book in place of an old book.

Customer addresses are fields on the party and immutable copies on issued documents. Signatures and attachments have dedicated stores indexed by document ID. Images/PDF attachments are portable data URLs inside IndexedDB, not remote object URLs. Current customer/supplier balances, money balances and reports are projections of persisted postings, not independently editable totals. Saved report snapshots are independent historical records. Local snapshots are outside the portable table list to avoid recursive copying.

The legacy single-file program's `localStorage` keys are only read to offer an explicit legacy export. The application does not silently reinterpret the old program's mutable numbers as verified double-entry history. No business write uses localStorage.

## Posting policy

All money amounts are safe integers in Toman, and quantities are positive whole cartons except for explicitly signed movements. Document dates are epoch milliseconds. Jalali rendering is a presentation concern. The core rejects fractional amounts, unsafe sums/products, invalid references and future/backdated operations that would rewrite FIFO or an already-posted related balance.

One read-write transaction includes all parts of a command: stock lots and movements, items, document snapshots, cash events, allocations, journals and audit marker. The submit token is checked inside the transaction. The button also locks for the duration of confirmation/posting. A failed second line, insufficient funds, bad attachment or interrupted write rolls back the first line too.

| Transaction              | Debit                                                         | Credit                                             |
| ------------------------ | ------------------------------------------------------------- | -------------------------------------------------- |
| Purchase                 | Inventory at actual acquisition cost                          | Supplier payable                                   |
| Supplier settlement      | Supplier payable                                              | Selected cash/bank account                         |
| Sale                     | Customer receivable (net), sales discounts                    | Sales revenue (gross plus charges)                 |
| Cost of sale             | COGS at original FIFO costs                                   | Inventory                                          |
| Customer receipt         | Selected cash/bank account                                    | Customer receivable                                |
| Sale return              | Sales returns (apportioned net) and inventory (original cost) | Receivable and COGS respectively                   |
| Purchase return          | Supplier payable                                              | Inventory from the original, still-available batch |
| Owner deposit/withdrawal | Cash or equity, as appropriate                                | Corresponding equity or cash                       |
| Transfer                 | Destination wallet                                            | Source wallet; no income or expense                |
| Operating expense        | Operating expenses                                            | Selected wallet                                    |
| Opening stock            | Inventory                                                     | Owner equity                                       |
| Count surplus/shortage   | Asset or discrepancy loss                                     | Discrepancy gain or asset                          |

The chart includes a purchase-returns account. Under **perpetual inventory**, a purchase return reduces inventory directly; it must not also create artificial income. Historical inventory adjustments remain adjustments, never synthetic purchase invoices. Gross profit is net trading revenue less COGS. Net profit also includes operating expenses and documented count gains/losses.

### Subledgers and allocations

AR is debit minus credit per customer; AP is credit minus debit per supplier. A negative amount is party credit/advance, not a negative physical wallet. Receivable/payable summaries separate debit and credit balances rather than netting unrelated people. The balance sheet reclassifies advances. A money wallet cannot be overdrawn in this implementation.

An invoice posts the whole trade to AR/AP; immediate settlement is a separate posting inside the same transaction. Allocation links do not post the money a second time. The allocation engine checks both remaining payment capacity and the open invoice balance. Advance receipts can be allocated later. A customer receipt larger than their debt is retained as credit.

Returns reference original invoice lines and batch slices. Discount/charge apportionment uses cumulative integer division with `BigInt`; sequential partial returns sum to the exact original net amount, even with rounding. A return releases excess allocations with offsetting allocation records. Actual cash refunds are separate operations limited to available party credit. Correcting a mistaken payment reopens its allocations and posts a compensating journal; cancelled money cannot be reused. No finalized invoice is hard-deleted.

### PDF and export

Local Canvas text shaping uses the bundled Persian font, pagination and A4 layout, then jsPDF embeds each rendered page. This avoids platform-dependent Arabic shaping in PDF fonts. Output is a real offline PDF; pages are rasterized and text is not searchable. Browser printing uses an independent print stylesheet. Documents use issue-time party, product, price, branding and signature snapshots; current settlement information is clearly separated from issue-time figures. CSV uses UTF-8 BOM, escaped cells and formula-prefix protection.

### Backup boundary

Portable archives use AES-256-GCM (128-bit tag), PBKDF2-SHA-256/210,000 iterations, random 16-byte salt and 12-byte IV and a version-bound authenticated context. No key is sent anywhere. Integrity verification checks store/ID structure, source documents versus journals, batch/stock/cash reconciliation, returns, payment capacities and media links. Compatible v2/v3 archives are upgraded without recosting old sales.

Restoration is replace-all, **not merge**. The UI creates a verified safety copy before the final confirmation, checks that the book did not change in a different tab, and restores and rechecks all tables in one transaction. A failed restore leaves the original database intact. Automatic snapshots use a consistent read, serialize/hash outside a write lock, and recheck the revision before retention pruning. Their checksums detect accidental damage; only portable files are password-encrypted. A local PIN is an optional UI guard, not access control against the device owner or a substitute for device encryption.
