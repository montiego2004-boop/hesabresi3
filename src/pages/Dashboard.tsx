import { ShieldCheck } from 'lucide-react';
import {
  ArrowDownLeft,
  ArrowLeft,
  BarChart3,
  Box,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronLeft,
  Coins,
  FilePlus2,
  HandCoins,
  Layers3,
  Package,
  Plus,
  ReceiptText,
  ShoppingBag,
  ShoppingCart,
  Sun,
  UserRoundPlus,
  Wallet,
  WalletCards,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dateFa, dayStart, fa, labels, sum } from '../core/model';
import {
  partyBalance,
  stock,
  summary,
  todayCash,
  transactionAmount,
  walletTotal,
} from '../core/reports';
import { EggIcon, Empty, GridTable, Heading, Metric, SectionHead } from '../ui/common';
import { useDesk } from '../ui/context';
export function Dashboard() {
  const { book: b, open } = useDesk(),
    go = useNavigate(),
    today = summary(b, dayStart()),
    all = summary(b),
    cash = todayCash(b);
  const receivables = sum(b.customers, (p) => Math.max(0, partyBalance(b, 'customer', p.id))),
    payables = sum(b.suppliers, (p) => Math.max(0, partyBalance(b, 'supplier', p.id)));
  return (
    <>
      <Heading title="داشبورد مدیریتی" sub="نمای کلی فروش، موجودی و وضعیت مالی کسب‌وکار شما">
        <button className="btn secondary" onClick={() => open('purchase')}>
          <ShoppingCart size={16} />
          ثبت خرید
        </button>
        <button className="btn primary" onClick={() => open('sale')}>
          <Plus size={17} />
          ثبت فروش
        </button>
      </Heading>
      <section className="hero">
        <div className="hero-art" role="img" aria-label="کارتن تخم‌مرغ و سکه‌های طلایی" />
        <div className="hero-content">
          <span className="hero-badge">
            <Sun size={13} /> خلاصه روزانه
          </span>
          <h2>عملکرد مالی امروز</h2>
          <div className="hero-stats">
            {[
              [ChartNoAxesCombined, 'فروش امروز', today.revenue],
              [ShoppingBag, 'خرید امروز', today.purchases],
              [Coins, 'سود خالص امروز', today.profit],
            ].map(([I, l, v]) => {
              const Icon = I as typeof Coins;
              return (
                <div key={String(l)}>
                  <span>
                    <Icon size={14} />
                    {String(l)}
                  </span>
                  <strong>
                    {fa(Number(v))} <small>تومان</small>
                  </strong>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      <div className="metrics">
        <Metric
          label="موجودی کل انبار"
          unit="کارتن"
          value={sum(b.batches, (x) => x.remaining)}
          icon={Package}
          color="amber"
          onClick={() => go('/inventory')}
        />
        <Metric
          label="موجودی صندوق"
          value={walletTotal(b, 'cash')}
          icon={Wallet}
          onClick={() => go('/cash')}
        />
        <Metric
          label="مطالبات مشتریان"
          value={receivables}
          icon={HandCoins}
          color="blue"
          onClick={() => go('/reports?view=debts')}
        />
        <Metric
          label="بدهی به تأمین‌کنندگان"
          value={payables}
          icon={WalletCards}
          color="rose"
          onClick={() => go('/reports?view=payables')}
        />
      </div>
      <div className="dashboard-duo">
        <TrendChart />
        <section className="card inventory-preview">
          <SectionHead title="موجودی به تفکیک کالا" sub="وضعیت فعلی کارتن‌های انبار">
            <span className="head-icon">
              <Layers3 size={19} />
            </span>
          </SectionHead>
          <div className="stock-list">
            {[...b.products]
              .sort((a, c) => order(a.id) - order(c.id))
              .slice(0, 3)
              .map((p) => (
                <button key={p.id} className="stock-row" onClick={() => go('/inventory/' + p.id)}>
                  <EggIcon tone={p.color} />
                  <span className="stock-name">
                    <b>{p.name}</b>
                    <small>{p.weight}</small>
                  </span>
                  <span className="stock-qty">
                    <b>{fa(stock(b, p.id).qty)}</b> کارتن
                  </span>
                </button>
              ))}
          </div>
          <button className="panel-link" onClick={() => go('/inventory')}>
            مشاهده انبار <ArrowLeft size={14} />
          </button>
        </section>
      </div>
      <div className="dashboard-duo lower-duo">
        <section className="card recent">
          <SectionHead title="آخرین تراکنش‌ها" sub="جدیدترین گردش‌های ثبت‌شده در حساب‌ها">
            <button className="text-link" onClick={() => go('/ledger')}>
              مشاهده همه <ChevronLeft size={14} />
            </button>
          </SectionHead>
          {b.entries.length ? (
            <GridTable
              heads={['شرح تراکنش', 'تاریخ', 'مبلغ (تومان)']}
              rows={b.entries
                .slice(0, 5)
                .map((e) => [e.description, dateFa(e.date), fa(transactionAmount(b, e))])}
            />
          ) : (
            <Empty
              icon={ReceiptText}
              title="هنوز تراکنشی ثبت نشده است"
              text="پس از ثبت خرید، فروش یا پرداخت، گردش حساب را اینجا ببینید."
            />
          )}
        </section>
        <section className="card quick-panel">
          <SectionHead title="دسترسی سریع" sub="عملیات پرکاربرد روزانه" />
          <div className="quick-grid">
            {[
              [UserRoundPlus, 'مشتری جدید', () => open('customer')],
              [ArrowDownLeft, 'دریافت وجه', () => open('payment', 'customer')],
              [ReceiptText, 'ثبت هزینه', () => open('cash', 'expense')],
              [Box, 'اصلاح موجودی', () => open('adjust')],
              [FilePlus2, 'صدور فاکتور', () => open('sale')],
              [BarChart3, 'گزارش‌ها', () => go('/reports')],
            ].map(([I, l, fn]) => {
              const Icon = I as typeof Box;
              return (
                <button key={String(l)} onClick={fn as () => void}>
                  <Icon size={19} />
                  {String(l)}
                </button>
              );
            })}
          </div>
        </section>
      </div>
      {b.audit.length > 0 &&
        !b.history.some((h) => h.kind === 'manual' && h.date > Date.now() - 7 * 86400000) && (
          <section className="card backup-reminder">
            <span>
              <ShieldCheck size={17} /> یک نسخه مستقل از دفترتان نگه دارید. تصویر محلی با پاک شدن
              داده‌های مرورگر از بین می‌رود.
            </span>
            <button className="text-link" onClick={() => go('/backup')}>
              پشتیبان‌گیری <ArrowLeft size={14} />
            </button>
          </section>
        )}
      <section className="card financial-summary">
        <SectionHead title="وضعیت مالی" sub="مانده حساب‌ها و گردش روز" />
        <div className="summary-grid">
          {[
            ['دریافت نقدی امروز', cash.in],
            ['پرداخت نقدی امروز', cash.out],
            [
              'مانده بانک‌ها',
              sum(
                b.wallets.filter((w) => w.id !== 'cash'),
                (w) => walletTotal(b, w.id),
              ),
            ],
            ['هزینه‌های امروز', today.expense],
            ['سود ناخالص امروز', today.gross],
            ['کل هزینه‌های عملیاتی', all.expense],
            ['سود ناخالص کل', all.gross],
            ['سود خالص کل', all.profit],
          ].map(([l, v]) => (
            <div key={l}>
              <small>{l}</small>
              <b>
                {fa(Number(v))} <em>تومان</em>
              </b>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
export const order = (id: string) => ({ light: 0, standard: 1, heavy: 2 })[id] ?? 3;
function TrendChart() {
  const { book: b } = useDesk();
  const [period, setPeriod] = useState('7'),
    [show, setShow] = useState({ sale: true, purchase: true });
  const total = Number(period),
    n = total === 30 ? 6 : 7,
    step = total === 30 ? 5 : 1,
    end = dayStart() + 86400000,
    points = Array.from({ length: n }, (_, i) => {
      const s = end - (n - i) * step * 86400000;
      return {
        d: s,
        sale: sum(
          b.sales.filter((x) => x.date >= s && x.date < s + step * 86400000),
          (x) => x.total,
        ),
        purchase: sum(
          b.purchases.filter((x) => x.date >= s && x.date < s + step * 86400000),
          (x) => x.total,
        ),
      };
    });
  const max = Math.max(1000000, ...points.flatMap((p) => [p.sale, p.purchase]));
  const x = (i: number) => 12 + (i * (640 - 24)) / (n - 1),
    y = (v: number) => 129 - (v / max) * 115;
  const has = points.some((p) => p.sale || p.purchase);
  return (
    <section className="card chart-card">
      <SectionHead title="روند خرید و فروش" sub="مقایسه مبالغ خرید و فروش در بازه زمانی">
        <div className="period">
          <select
            aria-label="بازه نمودار"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="7">۷ روز اخیر</option>
            <option value="30">۳۰ روز اخیر</option>
          </select>
          <ChevronDown size={13} />
        </div>
      </SectionHead>
      <div className="chart-meta">
        <div className="legend">
          {(['sale', 'purchase'] as const).map((k) => (
            <button
              key={k}
              aria-pressed={show[k]}
              onClick={() => setShow({ ...show, [k]: !show[k] })}
            >
              <i className={k} />
              {labels[k]}
            </button>
          ))}
        </div>
        <span>میلیون تومان</span>
      </div>
      <div className="plot" dir="ltr">
        <div className="plot-axis">
          {[1, 0.75, 0.5, 0.25, 0].map((f) => (
            <span key={f}>
              {new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(
                (max * f) / 1000000,
              )}
            </span>
          ))}
        </div>
        <div className="plot-body">
          <svg
            preserveAspectRatio="none"
            viewBox="0 0 640 146"
            aria-label="نمودار مبالغ واقعی خرید و فروش"
          >
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2d9b86" stopOpacity=".17" />
                <stop offset="100%" stopColor="#2d9b86" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[1, 0.75, 0.5, 0.25, 0].map((f) => (
              <line
                key={f}
                x1="0"
                y1={y(max * f)}
                x2="640"
                y2={y(max * f)}
                stroke="#dce4e4"
                strokeDasharray="4 5"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {(['purchase', 'sale'] as const).map(
              (k) =>
                show[k] && (
                  <g key={k}>
                    <path
                      d={'M' + points.map((p, i) => `${x(i)},${y(p[k])}`).join(' L')}
                      fill="none"
                      stroke={k === 'sale' ? '#268a76' : '#d9a546'}
                      strokeWidth={k === 'sale' ? 2 : 2.5}
                      strokeDasharray={k === 'purchase' ? '5 5' : undefined}
                      vectorEffect="non-scaling-stroke"
                    />
                    {points.map((p, i) => (
                      <circle
                        key={i}
                        cx={x(i)}
                        cy={y(p[k])}
                        r="3.3"
                        fill="white"
                        stroke={k === 'sale' ? '#268a76' : '#d9a546'}
                        strokeWidth="1.7"
                      >
                        <title>
                          {dateFa(p.d)}، {labels[k]}: {fa(p[k])} تومان
                        </title>
                      </circle>
                    ))}
                  </g>
                ),
            )}
          </svg>
          {!has && <span className="chart-empty">در این بازه گردشی ثبت نشده است</span>}
          <div className="axis-dates">
            {points.map((p) => (
              <span key={p.d}>
                {new Intl.DateTimeFormat('fa-IR', { day: 'numeric', month: 'short' }).format(p.d)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
