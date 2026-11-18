import { useLiveQuery } from 'dexie-react-hooks';
import {
  Archive,
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  BarChart3,
  BookCheck,
  BookOpenText,
  Check,
  ChevronDown,
  Download,
  FileDown,
  HandCoins,
  Landmark,
  Plus,
  ReceiptText,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../core/db';
import { atomic } from '../core/engine';
import { csv, download, makePDF } from '../core/files';
import { dateFa, dayStart, fa, id, isoDate, labels, sum } from '../core/model';
import {
  report,
  reportKinds,
  summary,
  todayCash,
  walletTotal,
  type ReportKey,
} from '../core/reports';
import {
  DateField,
  Empty,
  Find,
  GridTable,
  Heading,
  Metric,
  SectionHead,
  message,
} from '../ui/common';
import { useDesk } from '../ui/context';
export function CashPage() {
  const { book: b, open } = useDesk(),
    [wallet, set] = useState('all'),
    [tab, st] = useState('all'),
    today = todayCash(b),
    cash = walletTotal(b, 'cash'),
    bank = sum(
      b.wallets.filter((w) => w.id !== 'cash'),
      (w) => walletTotal(b, w.id),
    );
  const list = b.cash.filter(
    (t) => (wallet === 'all' || t.walletId === wallet) && (tab === 'all' || t.kind === tab),
  );
  return (
    <>
      <Heading title="صندوق و بانک" sub="مدیریت وجه نقد، حساب‌های بانکی و تسویه طرف‌های حساب">
        <button className="btn secondary" onClick={() => open('cash', 'transfer')}>
          <ArrowRightLeft size={16} />
          انتقال وجه
        </button>
        <button className="btn primary" onClick={() => open('payment', 'customer')}>
          <Plus size={16} />
          دریافت و پرداخت
        </button>
      </Heading>
      <div className="metrics">
        <Metric label="مانده صندوق نقدی" value={cash} icon={Wallet} />
        <Metric label="مانده حساب‌های بانکی" value={bank} icon={Landmark} color="blue" />
        <Metric label="دریافت نقدی امروز" value={today.in} icon={ArrowDownLeft} />
        <Metric label="پرداخت نقدی امروز" value={today.out} icon={ArrowUpRight} color="rose" />
      </div>
      <section className="card">
        <SectionHead title="حساب‌های مالی" sub="برای فیلتر کردن گردش‌ها روی حساب بزنید.">
          <button className="btn secondary small-btn" onClick={() => open('bank')}>
            <Plus size={14} />
            حساب بانکی
          </button>
        </SectionHead>
        <div className="wallet-list">
          {b.wallets.map((w) => (
            <button
              key={w.id}
              className={wallet === w.id ? 'selected' : ''}
              onClick={() => set(wallet === w.id ? 'all' : w.id)}
            >
              {w.id === 'cash' ? <Wallet size={22} /> : <Landmark size={22} />}
              <div>
                <small>{w.name}</small>
                <b>{fa(walletTotal(b, w.id))} تومان</b>
              </div>
            </button>
          ))}
        </div>
        <div className="cash-buttons">
          {[
            ['opening', 'مانده افتتاحیه'],
            ['deposit', 'واریز'],
            ['withdraw', 'برداشت'],
            ['expense', 'ثبت هزینه'],
            ['closing', 'بستن و شمارش صندوق'],
            ['correction', 'اصلاح نقدی'],
          ].map(([k, l]) => (
            <button className="btn secondary small-btn" key={k} onClick={() => open('cash', k)}>
              {l}
            </button>
          ))}
        </div>
      </section>
      <section className="card">
        <SectionHead title="گردش‌های مالی" sub="وجوه صندوق و هر حساب بانکی مستقل است." />
        <div className="toolbar">
          <select value={wallet} aria-label="فیلتر حساب" onChange={(e) => set(e.target.value)}>
            <option value="all">همه حساب‌ها</option>
            {b.wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <select value={tab} aria-label="فیلتر نوع تراکنش" onChange={(e) => st(e.target.value)}>
            <option value="all">همه عملیات</option>
            {Object.keys(labels)
              .filter((k) =>
                [
                  'opening',
                  'deposit',
                  'withdraw',
                  'expense',
                  'closing',
                  'correction',
                  'transfer',
                  'receipt',
                  'pay',
                  'customerRefund',
                  'supplierRefund',
                ].includes(k),
              )
              .map((k) => (
                <option key={k} value={k}>
                  {labels[k]}
                </option>
              ))}
          </select>
        </div>
        <GridTable
          heads={['تاریخ', 'حساب', 'نوع', 'شرح', 'مبلغ (تومان)', 'اصلاح']}
          rows={list.map((t) => [
            dateFa(t.date),
            b.wallets.find((w) => w.id === t.walletId)!.name,
            labels[t.kind],
            t.description,
            <b className={t.amount > 0 ? 'green-text' : 'red-text'}>{fa(t.amount)}</b>,
            [
              'deposit',
              'withdraw',
              'expense',
              'transfer',
              'receipt',
              'pay',
              'customerRefund',
              'supplierRefund',
            ].includes(t.kind) ? (
              b.audit.some((a) => a.type === 'cashReversal' && a.docId === t.docId) ? (
                <span className="tag neutral">ابطال‌شده</span>
              ) : (
                <button className="text-link" onClick={() => open('reverseMoney', t.docId)}>
                  سند معکوس
                </button>
              )
            ) : (
              '—'
            ),
          ])}
        />
      </section>
      <section className="card">
        <SectionHead title="تطبیق و بستن صندوق" sub="مقایسه مانده دفتری با موجودی فیزیکی" />
        <div className="summary-grid">
          {[
            [
              'افتتاحیه ثبت‌شده',
              sum(
                b.cash.filter((r) => r.walletId === 'cash' && r.kind === 'opening'),
                (r) => r.amount,
              ),
            ],
            ['مانده ابتدای امروز', walletTotal(b, 'cash', dayStart() - 1)],
            ['هزینه نقدی امروز', today.expenses],
            ['مانده پایان امروز', cash],
          ].map(([k, v]) => (
            <div key={k}>
              <small>{k}</small>
              <b>
                {fa(Number(v))} <em>تومان</em>
              </b>
            </div>
          ))}
        </div>
        <GridTable
          heads={['تاریخ', 'حساب', 'دفتری', 'شمارش واقعی', 'اختلاف']}
          rows={b.adjust
            .filter((a) => a.kind === 'closing' || a.kind === 'correction')
            .map((a) => [
              dateFa(a.date),
              b.wallets.find((w) => w.id === a.target)?.name,
              fa(a.before),
              fa(a.actual),
              fa(a.diff),
            ])}
          empty="هنوز شمارش نقدی ثبت نشده است"
        />
      </section>
    </>
  );
}
export function Ledger() {
  const { book: b } = useDesk(),
    [tab, set] = useState('journal'),
    [q, sq] = useState(''),
    [account, sa] = useState('all'),
    debits = sum(b.lines, (l) => l.debit),
    credits = sum(b.lines, (l) => l.credit),
    entries = b.entries.filter(
      (e) =>
        e.description.includes(q.trim()) &&
        (account === 'all' || b.lines.some((l) => l.entryId === e.id && l.accountId === account)),
    );
  return (
    <>
      <Heading title="دفتر حسابداری" sub="اسناد دوطرفه، گردش حساب‌ها و کنترل تراز" />
      <div className="metrics three">
        <Metric label="جمع بدهکار" value={debits} icon={ArrowDownLeft} />
        <Metric label="جمع بستانکار" value={credits} icon={ArrowUpRight} color="blue" />
        <Metric label="اختلاف تراز" value={debits - credits} icon={BookCheck} color="amber" />
      </div>
      <section className="card">
        <SectionHead title="دفاتر مالی">
          <span className="tag jade">
            <Check size={13} />
            {debits === credits ? 'تراز متوازن' : 'نیازمند بررسی'}
          </span>
        </SectionHead>
        <div className="tabs">
          {[
            ['journal', 'دفتر روزنامه'],
            ['ledger', 'دفتر کل'],
            ['trial', 'تراز آزمایشی'],
            ['balanceSheet', 'ترازنامه'],
          ].map(([k, l]) => (
            <button key={k} className={k === tab ? 'active' : ''} onClick={() => set(k)}>
              {l}
            </button>
          ))}
        </div>
        {tab === 'journal' ? (
          <>
            <div className="toolbar">
              <Find value={q} onChange={sq} placeholder="جست‌وجوی شرح سند…" />
              <select value={account} aria-label="انتخاب حساب" onChange={(e) => sa(e.target.value)}>
                <option value="all">همه حساب‌های کل</option>
                {b.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            {entries.length ? (
              entries.map((e) => (
                <details className="journal-item" key={e.id}>
                  <summary>
                    <span className="icon-box jade">
                      <BookOpenText size={18} />
                    </span>
                    <div>
                      <b>{e.description}</b>
                      <small>
                        {dateFa(e.date)} · {labels[e.type] || e.type}
                      </small>
                    </div>
                    <ChevronDown size={16} />
                  </summary>
                  <GridTable
                    heads={['حساب کل', 'بدهکار', 'بستانکار']}
                    rows={b.lines
                      .filter((l) => l.entryId === e.id)
                      .map((l) => [
                        b.accounts.find((a) => a.id === l.accountId)?.name,
                        fa(l.debit),
                        fa(l.credit),
                      ])}
                  />
                  <small>شناسه سند: {e.docId}</small>
                </details>
              ))
            ) : (
              <Empty
                title="سند حسابداری یافت نشد"
                text="با ثبت هر عملیات مالی، سند دوطرفه به‌صورت خودکار ایجاد می‌شود."
              />
            )}
          </>
        ) : (
          <GridTable
            heads={report(b, tab as ReportKey).columns}
            rows={report(b, tab as ReportKey).rows}
          />
        )}
      </section>
    </>
  );
}
export function Reports() {
  const { book: b, notice, confirm } = useDesk(),
    [params, setParams] = useSearchParams(),
    key = (
      Object.hasOwn(reportKinds, params.get('view') || '') ? params.get('view') : 'profit'
    ) as ReportKey,
    [range, sr] = useState('all'),
    [from, sf] = useState(isoDate(dayStart() - 6 * 86400000)),
    [to, st] = useState(isoDate()),
    [busy, sb] = useState(false);
  const start =
      range === 'custom'
        ? +new Date(from + 'T00:00:00')
        : range === 'all'
          ? 0
          : dayStart() - (Number(range) - 1) * 86400000,
    end = range === 'custom' ? +new Date(to + 'T23:59:59.999') : Date.now();
  const archived =
    useLiveQuery(() => db.savedReports.orderBy('date').reverse().toArray(), []) || [];
  const data = report(b, key, start, end),
    s = summary(b, start, end);
  return (
    <>
      <Heading
        title="گزارش‌ها و تحلیل مالی"
        sub="تحلیل اطلاعات واقعی دفتر، با خروجی آفلاین و فیلتر تاریخ"
      >
        <button className="btn secondary" onClick={() => csv(data)}>
          <Download size={15} />
          خروجی CSV
        </button>
        <button
          className="btn primary"
          disabled={busy || start > end}
          onClick={async () => {
            sb(true);
            try {
              download(
                await makePDF({
                  ...data,
                  business: b.settings.business,
                  details: [
                    'بازه: ' + (start ? dateFa(start) : 'ابتدای دوره') + ' تا ' + dateFa(end),
                    'واحد مبالغ: تومان',
                  ],
                }),
                data.title + '.pdf',
              );
            } catch (e) {
              notice(message(e));
            } finally {
              sb(false);
            }
          }}
        >
          <FileDown size={16} />
          {busy ? 'آماده‌سازی…' : 'خروجی پی‌دی‌اف'}
        </button>
      </Heading>
      <div className="metrics three">
        <Metric label="فروش خالص در بازه" value={s.revenue} icon={ReceiptText} />
        <Metric label="سود ناخالص در بازه" value={s.gross} icon={BarChart3} color="blue" />
        <Metric label="سود خالص در بازه" value={s.profit} icon={HandCoins} color="amber" />
      </div>
      <section className="card">
        <SectionHead title="تنظیم گزارش" sub="بازه زمانی و نوع گزارش را انتخاب کنید." />
        <div className="report-controls">
          <label className="field">
            <span>نوع گزارش</span>
            <select value={key} onChange={(e) => setParams({ view: e.target.value })}>
              {Object.entries(reportKinds).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>دوره گزارش</span>
            <select value={range} onChange={(e) => sr(e.target.value)}>
              <option value="all">از ابتدای دوره</option>
              <option value="1">امروز</option>
              <option value="7">۷ روز اخیر</option>
              <option value="30">۳۰ روز اخیر</option>
              <option value="365">۳۶۵ روز اخیر</option>
              <option value="custom">بازه دلخواه</option>
            </select>
          </label>
          {range === 'custom' && (
            <>
              <DateField label="از تاریخ" value={from} onChange={sf} />
              <DateField label="تا تاریخ" value={to} onChange={st} />
            </>
          )}
        </div>
        {start > end && <p className="alert error">تاریخ شروع باید پیش از پایان بازه باشد.</p>}
      </section>
      <section className="card print-target">
        <SectionHead title={data.title} sub="مبالغ بر حسب تومان هستند.">
          <span className="tag neutral">{fa(data.rows.length)} ردیف</span>
        </SectionHead>
        <GridTable heads={data.columns} rows={data.rows} />
      </section>
      <section className="card">
        <SectionHead
          title="بایگانی گزارش‌ها"
          sub="تصویری ثابت از گزارش برای مراجعه‌های بعدی نگه دارید."
        >
          <button
            className="btn secondary small-btn"
            disabled={busy || start > end}
            onClick={async () => {
              if (!(await confirm('نسخه‌ای از ارقام فعلی این گزارش در بایگانی دستگاه ذخیره شود؟')))
                return;
              sb(true);
              try {
                const k = id();
                await atomic(k, 'report', data.title, () =>
                  db.savedReports.add({
                    ...data,
                    id: k,
                    date: Date.now(),
                    from: start,
                    to: end,
                    kind: key,
                    business: b.settings.business,
                  }),
                );
                notice('گزارش در بایگانی محلی ذخیره شد.');
              } catch (e) {
                notice(message(e));
              } finally {
                sb(false);
              }
            }}
          >
            <Archive size={15} />
            بایگانی گزارش فعلی
          </button>
        </SectionHead>
        <GridTable
          heads={['عنوان گزارش', 'زمان ثبت', 'تعداد ردیف', 'خروجی تاریخی']}
          rows={archived.map((r) => [
            r.title,
            dateFa(r.date),
            fa(r.rows.length),
            <div className="actions">
              <button className="text-link" onClick={() => csv(r)}>
                CSV
              </button>
              <button
                className="text-link"
                onClick={async () => {
                  try {
                    download(
                      await makePDF({
                        ...r,
                        details: [
                          'نسخه بایگانی‌شده در ' + dateFa(r.date),
                          'از ' + (r.from ? dateFa(r.from) : 'ابتدای دوره') + ' تا ' + dateFa(r.to),
                        ],
                      }),
                      r.title + '.pdf',
                    );
                  } catch (e) {
                    notice(message(e));
                  }
                }}
              >
                پی‌دی‌اف
              </button>
            </div>,
          ])}
          empty="هنوز گزارشی بایگانی نشده است"
        />
      </section>
    </>
  );
}
