import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  ClipboardCheck,
  Download,
  FileDown,
  HandCoins,
  Layers3,
  MapPin,
  Package,
  PenLine,
  Plus,
  Printer,
  ReceiptText,
  RotateCcw,
  Share2,
  ShoppingBasket,
  Truck,
  UserRoundPlus,
  UsersRound,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../core/db';
import { download, makePDF, saveFile, shareFile, type PrintData } from '../core/files';
import { dateFa, fa, labels, norm, sum, type Invoice, type Role, type Side } from '../core/model';
import { docDue, partyBalance, stock } from '../core/reports';
import {
  BrandMark,
  EggIcon,
  Empty,
  Find,
  GridTable,
  Heading,
  Metric,
  SectionHead,
  message,
} from '../ui/common';
import { useDesk } from '../ui/context';
import { order } from './Dashboard';
export function NotFound() {
  return (
    <section className="card">
      <Empty title="این صفحه پیدا نشد" text="این رکورد در دفتر فعلی وجود ندارد.">
        <Link className="btn primary" to="/">
          بازگشت به داشبورد
        </Link>
      </Empty>
    </section>
  );
}
const match = (q: string, ...vals: string[]) =>
  norm(vals.join(' ')).toLowerCase().includes(norm(q.trim()).toLowerCase());
export function Directory({ role }: { role: Role }) {
  const { book: b, open } = useDesk(),
    go = useNavigate(),
    [q, set] = useState(''),
    [filter, sf] = useState('all'),
    cust = role === 'customer',
    list = cust ? b.customers : b.suppliers,
    path = cust ? '/customers' : '/suppliers',
    show = list
      .filter((p) => match(q, p.name, p.phone, p.address, p.delivery))
      .filter((p) => {
        const v = partyBalance(b, role, p.id);
        return (
          filter === 'all' || (filter === 'debt' ? v > 0 : filter === 'credit' ? v < 0 : v === 0)
        );
      });
  return (
    <>
      <Heading
        title={cust ? 'مدیریت مشتریان' : 'مدیریت تأمین‌کنندگان'}
        sub={
          cust
            ? 'اطلاعات تماس، نشانی تحویل و حساب مشتریان'
            : 'مشخصات تأمین‌کنندگان و وضعیت پرداخت‌ها'
        }
      >
        <button className="btn primary" onClick={() => open(role)}>
          <UserRoundPlus size={17} />
          {cust ? 'مشتری جدید' : 'تأمین‌کننده جدید'}
        </button>
      </Heading>
      <div className="metrics three">
        <Metric
          icon={cust ? UsersRound : Truck}
          label={cust ? 'تعداد مشتریان' : 'تعداد تأمین‌کنندگان'}
          value={list.length}
          unit="نفر"
          color="blue"
        />
        <Metric
          icon={HandCoins}
          label={cust ? 'مجموع مطالبات' : 'مجموع بدهی به تأمین‌کنندگان'}
          value={sum(list, (p) => Math.max(0, partyBalance(b, role, p.id)))}
        />
        <Metric
          icon={Wallet}
          label="مجموع اعتبار طرف حساب"
          value={sum(list, (p) => Math.max(0, -partyBalance(b, role, p.id)))}
          color="amber"
        />
      </div>
      <section className="card">
        <SectionHead
          title={cust ? 'دفتر مشتریان' : 'دفتر تأمین‌کنندگان'}
          sub="برای مشاهده گردش حساب، نام طرف حساب را انتخاب کنید."
        />
        <div className="toolbar">
          <Find placeholder="جست‌وجوی نام، تلفن یا نشانی…" value={q} onChange={set} />
          <select aria-label="فیلتر مانده" value={filter} onChange={(e) => sf(e.target.value)}>
            <option value="all">تمام مانده‌ها</option>
            <option value="debt">دارای بدهی</option>
            <option value="credit">دارای اعتبار</option>
            <option value="zero">تسویه‌شده</option>
          </select>
        </div>
        <GridTable
          heads={['نام طرف حساب', 'شماره تماس', 'نشانی', 'مانده (تومان)', 'پرونده']}
          rows={show.map((p) => [
            <Link className="name-link" to={path + '/' + p.id}>
              <span className="avatar small">{p.name[0]}</span>
              {p.name}
            </Link>,
            p.phone || '—',
            p.address || '—',
            fa(partyBalance(b, role, p.id)),
            <button
              className="icon-btn"
              aria-label={'مشاهده ' + p.name}
              onClick={() => go(path + '/' + p.id)}
            >
              <ArrowUpLeft size={16} />
            </button>,
          ])}
          empty={q ? 'طرف حسابی با این مشخصات پیدا نشد' : 'هنوز طرف حسابی در این فهرست نیست'}
        />
      </section>
    </>
  );
}
export function PartyProfile({ role }: { role: Role }) {
  const { book: b, open, notice } = useDesk(),
    { id } = useParams(),
    [tab, set] = useState('statement'),
    cust = role === 'customer',
    p = (cust ? b.customers : b.suppliers).find((x) => x.id === id);
  if (!p) return <NotFound />;
  const docs = (cust ? b.sales : b.purchases).filter((i) => i.partyId === p.id),
    payments = b.payments.filter((x) => x.partyId === p.id && x.role === role),
    value = partyBalance(b, role, p.id),
    items = (cust ? b.saleItems : b.purchaseItems).filter((x) =>
      docs.some((i) => i.id === x.invoiceId),
    ),
    returns = b.returns.filter((r) => docs.some((i) => i.id === r.invoiceId));
  let run = 0;
  const stRows = b.lines
    .filter((l) => l.partyId === p.id && l.accountId === (cust ? 'ar' : 'ap'))
    .sort((a, c) => a.date - c.date)
    .map((l) => {
      run += (l.debit - l.credit) * (cust ? 1 : -1);
      return [
        dateFa(l.date),
        b.entries.find((e) => e.id === l.entryId)!.description,
        fa(l.debit),
        fa(l.credit),
        fa(run),
      ];
    });
  const heads = ['تاریخ', 'شرح', 'بدهکار', 'بستانکار', 'مانده'];
  return (
    <>
      <Back to={cust ? '/customers' : '/suppliers'} name={cust ? 'مشتریان' : 'تأمین‌کنندگان'} />
      <Heading
        title={p.name}
        sub={'پرونده ' + labels[role] + ' · ثبت‌شده در ' + dateFa(p.createdAt)}
      >
        <button className="btn secondary" onClick={() => open(role, p.id)}>
          <PenLine size={15} />
          ویرایش مشخصات
        </button>
        <button className="btn primary" onClick={() => open('payment', role, p.id)}>
          <Wallet size={16} />
          {cust ? 'ثبت دریافت' : 'ثبت پرداخت'}
        </button>
      </Heading>
      <div className="metrics">
        <Metric
          icon={Package}
          label="مجموع کارتن خالص"
          value={
            sum(items, (i) => i.qty) -
            sum(
              returns.flatMap((r) => r.items),
              (i) => i.qty,
            )
          }
          unit="کارتن"
          color="amber"
        />
        <Metric
          icon={ReceiptText}
          label={cust ? 'فروش به مشتری' : 'خرید از تأمین‌کننده'}
          value={sum(docs, (i) => i.total) - sum(returns, (r) => r.total)}
        />
        <Metric
          icon={Wallet}
          label="مجموع تسویه خالص"
          value={sum(payments, (r) => r.amount * (r.refund ? -1 : 1))}
          color="blue"
        />
        <Metric
          icon={HandCoins}
          label={value < 0 ? 'اعتبار طرف حساب' : 'مانده بدهی'}
          value={Math.abs(value)}
          color="rose"
        />
      </div>
      <section className="card">
        <SectionHead title="مشخصات و نشانی‌ها" />
        <div className="details-grid">
          {[
            ['تلفن', p.phone],
            ['نشانی', p.address],
            ...(cust
              ? [
                  ['نشانی تحویل', p.delivery],
                  ['موقعیت تحویل', p.location],
                  ['زمان تحویل', p.time],
                  ['راهنمای تحویل', p.instructions],
                ]
              : []),
            ['یادداشت', p.notes],
          ].map(([l, v]) => (
            <div key={l}>
              <small>{l}</small>
              <b>{v || '—'}</b>
            </div>
          ))}
        </div>
        {(p.location || p.delivery || p.address) && (
          <a
            className="map-link"
            href={'geo:0,0?q=' + encodeURIComponent(p.location || p.delivery || p.address)}
          >
            <MapPin size={14} />
            باز کردن در نقشه دستگاه
          </a>
        )}
      </section>
      <section className="card">
        <SectionHead title="گردش حساب" sub="همه مبالغ به تومان است.">
          <button
            className="btn small-btn secondary"
            onClick={async () => {
              try {
                download(
                  await makePDF({
                    title: 'صورت‌حساب ' + p.name,
                    business: b.settings.business,
                    columns: heads,
                    rows: stRows,
                    details: [p.name, 'نشانی: ' + p.address, 'نشانی تحویل: ' + p.delivery],
                    totals: ['مانده: ' + fa(value) + ' تومان'],
                  }),
                  'صورت‌حساب.pdf',
                );
              } catch (e) {
                notice(message(e));
              }
            }}
          >
            <FileDown size={15} />
            صورت‌حساب
          </button>
        </SectionHead>
        <div className="tabs">
          {[
            ['statement', 'صورت‌حساب'],
            ['docs', 'فاکتورها'],
            ['out', 'فاکتورهای باز'],
            ['pay', 'پرداخت‌ها'],
          ].map(([k, l]) => (
            <button key={k} className={tab === k ? 'active' : ''} onClick={() => set(k)}>
              {l}
            </button>
          ))}
        </div>
        {tab === 'statement' ? (
          <GridTable heads={heads} rows={[...stRows].reverse()} />
        ) : tab === 'pay' ? (
          <GridTable
            heads={['تاریخ', 'شرح', 'مبلغ', 'تخصیص‌نیافته', 'عملیات']}
            rows={payments.map((x) => {
              const free =
                x.amount -
                sum(
                  b.allocations.filter((a) => a.paymentId === x.id),
                  (a) => a.amount,
                );
              return [
                dateFa(x.date),
                x.description,
                fa(x.amount),
                x.refund || x.voidedBy || x.reversalOf ? '—' : fa(free),
                !x.refund && !x.voidedBy && !x.reversalOf && free > 0 ? (
                  <button className="text-link" onClick={() => open('allocate', x.id)}>
                    تخصیص به فاکتور
                  </button>
                ) : (
                  '—'
                ),
              ];
            })}
          />
        ) : (
          <DocTable docs={docs.filter((i) => tab !== 'out' || docDue(b, i) > 0)} />
        )}
      </section>
    </>
  );
}
function Back({ to, name }: { to: string; name: string }) {
  return (
    <Link className="back-link" to={to}>
      <ArrowRight size={14} />
      بازگشت به {name}
    </Link>
  );
}
function DocTable({ docs }: { docs: Invoice[] }) {
  const { book: b } = useDesk();
  return (
    <GridTable
      heads={['شماره فاکتور', 'طرف حساب', 'تاریخ', 'مبلغ (تومان)', 'وضعیت', 'مشاهده']}
      rows={docs.map((i) => {
        const due = docDue(b, i),
          href = (i.side === 'sale' ? '/sales/' : '/purchases/') + i.id;
        return [
          <Link className="doc-number" to={href}>
            {i.number}
          </Link>,
          i.party.name,
          dateFa(i.date),
          fa(i.total),
          <span className={'tag ' + (i.status === 'reversed' ? 'rose' : due ? 'amber' : 'jade')}>
            {i.status === 'reversed' ? 'برگشت کامل' : due ? 'مانده‌دار' : 'تسویه‌شده'}
          </span>,
          <Link className="icon-btn" aria-label={'مشاهده فاکتور ' + i.number} to={href}>
            <ArrowUpLeft size={16} />
          </Link>,
        ];
      })}
    />
  );
}
export function DocsList({ side }: { side: Side }) {
  const { book: b, open } = useDesk(),
    [q, sq] = useState(''),
    [filter, sf] = useState('all'),
    sale = side === 'sale',
    list = sale ? b.sales : b.purchases;
  return (
    <>
      <Heading
        title={sale ? 'فروش و فاکتورها' : 'مدیریت خریدها'}
        sub={
          sale
            ? 'صدور فاکتور، گردش فروش و پیگیری تسویه‌ها'
            : 'ثبت خرید، دریافت بچ‌های کالا و کنترل حساب تأمین‌کنندگان'
        }
      >
        <button className="btn primary" onClick={() => open(side)}>
          <Plus size={16} />
          ثبت {labels[side]} جدید
        </button>
      </Heading>
      <div className="metrics three">
        <Metric
          icon={ReceiptText}
          label="تعداد فاکتورها"
          value={list.length}
          unit="فاکتور"
          color="blue"
        />
        <Metric
          icon={sale ? HandCoins : ShoppingBasket}
          label={labels[side] + ' خالص دوره'}
          value={
            sum(list, (i) => i.total) -
            sum(
              b.returns.filter((r) => r.side === side),
              (r) => r.total,
            )
          }
        />
        <Metric
          icon={Wallet}
          label="مانده فاکتورهای باز"
          value={sum(list, (i) => docDue(b, i))}
          color="amber"
        />
      </div>
      <section className="card">
        <SectionHead
          title={'دفتر فاکتورهای ' + labels[side]}
          sub="اصل فاکتور و گردش‌های اصلاحی به‌صورت دائمی نگهداری می‌شوند."
        />
        <div className="toolbar">
          <Find value={q} onChange={sq} placeholder="جست‌وجوی فاکتور یا طرف حساب…" />
          <select value={filter} aria-label="وضعیت فاکتور" onChange={(e) => sf(e.target.value)}>
            <option value="all">همه وضعیت‌ها</option>
            <option value="open">مانده‌دار</option>
            <option value="paid">تسویه‌شده</option>
            <option value="reversed">برگشت کامل</option>
          </select>
        </div>
        <DocTable
          docs={list
            .filter((i) => match(q, i.number, i.party.name))
            .filter(
              (i) =>
                filter === 'all' ||
                (filter === 'open'
                  ? docDue(b, i) > 0
                  : filter === 'paid'
                    ? i.status === 'posted' && !docDue(b, i)
                    : i.status === 'reversed'),
            )}
        />
      </section>
    </>
  );
}
export function InvoicePage({ side }: { side: Side }) {
  const { book: b, open, notice } = useDesk(),
    { id } = useParams(),
    sale = side === 'sale',
    i = (sale ? b.sales : b.purchases).find((i) => i.id === id),
    media = useLiveQuery(
      async () => ({
        signatures: await db.signatures.where('docId').equals(id!).toArray(),
        files: await db.attachments.where('docId').equals(id!).toArray(),
      }),
      [id],
    ),
    [busy, setBusy] = useState(false);
  if (!i) return <NotFound />;
  const rows = (sale ? b.saleItems : b.purchaseItems).filter((l) => l.invoiceId === i.id),
    due = docDue(b, i),
    returns = b.returns.filter((r) => r.invoiceId === i.id),
    paidLater = b.allocations.filter((a) => a.invoiceId === i.id && a.target === 'invoice'),
    heads = ['شرح کالا', 'تعداد کارتن', 'قیمت واحد', 'مبلغ ردیف'],
    lines = rows.map((l) => [l.name, fa(l.qty), fa(l.price), fa(l.gross)]);
  const data: PrintData = {
    title: 'فاکتور ' + labels[side] + ' ' + i.number,
    business: i.business,
    logo: i.logo,
    columns: heads,
    rows: lines,
    details: [
      'شماره فاکتور: ' + i.number + '     تاریخ: ' + dateFa(i.date),
      'طرف حساب: ' + i.party.name + '     تلفن: ' + (i.party.phone || '—'),
      'نشانی: ' + (i.party.address || '—'),
      'نشانی تحویل: ' + (i.party.delivery || '—'),
      'روش تسویه: ' + i.method + (i.status === 'reversed' ? '  •  برگشت کامل' : ''),
    ],
    totals: [
      ['جمع کالاها', i.gross],
      ['تخفیف', i.discount],
      ['سایر هزینه‌ها', i.fee],
      ['مبلغ نهایی', i.total],
      ['مانده قبلی', i.previous],
      ['پرداخت هنگام صدور', i.paid],
      ['مانده حساب هنگام صدور', i.previous + i.total - i.paid],
      ['مانده فعلی این فاکتور', due],
    ]
      .map(([k, v]) => k + ': ' + fa(Number(v)) + ' تومان')
      .concat(i.notes ? [i.notes] : []),
    signatures: media?.signatures,
  };
  const file = async (share = false) => {
    setBusy(true);
    try {
      const blob = await makePDF(data);
      if (share) await shareFile(blob, i.number + '.pdf');
      else await saveFile(blob, i.number + '.pdf');
    } catch (e) {
      notice(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Back to={sale ? '/sales' : '/purchases'} name={'فاکتورهای ' + labels[side]} />
      <Heading title={'فاکتور ' + labels[side]} sub="نسخه نهایی و قابل چاپ سند محلی">
        <button className="btn secondary" onClick={() => window.print()}>
          <Printer size={15} />
          چاپ
        </button>
        <button className="btn secondary" disabled={busy || !media} onClick={() => file(true)}>
          <Share2 size={15} />
          اشتراک
        </button>
        <button className="btn primary" disabled={busy || !media} onClick={() => file()}>
          <FileDown size={16} />
          {busy ? 'در حال آماده‌سازی…' : 'ذخیره پی‌دی‌اف'}
        </button>
      </Heading>
      <article className="card invoice-paper print-target">
        <div className="paper-head">
          <div className="paper-brand">
            {i.logo ? <img src={i.logo} alt="نشان مجموعه" /> : <BrandMark />}
            <div>
              <b>{i.business}</b>
              <small>فاکتور {labels[side]}</small>
            </div>
          </div>
          <div>
            <b dir="ltr">{i.number}</b>
            <small>{dateFa(i.date)}</small>
          </div>
        </div>
        <div className="details-grid">
          <div>
            <small>طرف حساب</small>
            <b>{i.party.name}</b>
          </div>
          <div>
            <small>تلفن</small>
            <b>{i.party.phone || '—'}</b>
          </div>
          <div>
            <small>روش تسویه</small>
            <b>{i.method}</b>
          </div>
          <div>
            <small>نشانی فروشگاه</small>
            <b>{i.party.address || '—'}</b>
          </div>
          <div>
            <small>نشانی تحویل</small>
            <b>{i.party.delivery || '—'}</b>
          </div>
          <div>
            <small>وضعیت</small>
            <b>{i.status === 'reversed' ? 'برگشت کامل' : 'نهایی‌شده'}</b>
          </div>
        </div>
        <GridTable heads={heads} rows={lines} paginate={false} />
        <div className="paper-totals">
          {data.totals!.slice(0, 8).map((v, j) => (
            <div className={j === 3 ? 'bill-summary' : ''} key={j}>
              <span>{v.split(': ')[0]}</span>
              <b>{v.split(': ')[1]}</b>
            </div>
          ))}
        </div>
        {i.notes && <p className="padded">یادداشت: {i.notes}</p>}
        <div className="signature-list">
          {(media?.signatures || []).map((s) => (
            <div key={s.id}>
              <small>{s.name === 'buyer' ? 'امضای خریدار' : 'امضای فروشنده'}</small>
              <img src={s.data} alt="امضای ثبت‌شده" />
            </div>
          ))}
        </div>
      </article>
      <section className="card">
        <SectionHead title="سوابق و عملیات سند">
          <div className="actions">
            {i.status === 'posted' && (
              <>
                <button className="btn secondary small-btn" onClick={() => open('return', i.id)}>
                  <RotateCcw size={14} />
                  برگشت کالا
                </button>
                <button
                  className="btn danger small-btn"
                  onClick={() => open('return', i.id, 'reverse')}
                >
                  <XCircle size={14} />
                  ابطال فاکتور
                </button>
              </>
            )}
          </div>
        </SectionHead>
        <div className="padded">
          <p>
            تسویه تخصیص‌یافته: <b>{fa(sum(paidLater, (a) => a.amount))} تومان</b> · مانده فاکتور:{' '}
            <b>{fa(due)} تومان</b>
          </p>
          {returns.map((r) => (
            <p key={r.id}>
              برگشت {dateFa(r.date)} · {r.reason} · {fa(r.total)} تومان
            </p>
          ))}
          {media?.files.map((f) => (
            <a key={f.id} className="text-link" href={f.data} download={f.name}>
              <Download size={15} /> {f.name}
            </a>
          ))}
          {due > 0 && (
            <button
              className="text-link"
              onClick={() => open('payment', sale ? 'customer' : 'supplier', i.partyId)}
            >
              ثبت تسویه طرف حساب <ArrowLeft size={14} />
            </button>
          )}
        </div>
      </section>
    </>
  );
}
export function Inventory() {
  const { book: b, open } = useDesk(),
    [filter, set] = useState('all'),
    products = [...b.products].sort((a, c) => order(a.id) - order(c.id));
  return (
    <>
      <Heading title="مدیریت انبار" sub="موجودی کارتن‌ها، ارزش کالا و گردش بچ‌های خرید">
        <button className="btn secondary" onClick={() => open('adjust')}>
          <ClipboardCheck size={16} />
          شمارش و اصلاح
        </button>
        <button className="btn primary" onClick={() => open('purchase')}>
          <Plus size={16} />
          ورود از خرید
        </button>
      </Heading>
      <div className="product-grid">
        {products.map((p) => {
          const s = stock(b, p.id);
          return (
            <Link to={'/inventory/' + p.id} className={'card product-card ' + p.color} key={p.id}>
              <div className="product-title">
                <EggIcon tone={p.color} />
                <div>
                  <h2>{p.name}</h2>
                  <small>{p.weight}</small>
                </div>
                <ArrowUpLeft size={16} />
              </div>
              <div className="product-count">
                <b>{fa(s.qty)}</b> کارتن موجود
              </div>
              <div className="product-foot">
                <span>ارزش موجودی</span>
                <b>{fa(s.value)} تومان</b>
              </div>
            </Link>
          );
        })}
      </div>
      <section className="card">
        <SectionHead title="دفتر گردش کالا" sub="هر تغییر موجودی به یک سند ثبت‌شده متصل است.">
          <select aria-label="نوع گردش" value={filter} onChange={(e) => set(e.target.value)}>
            <option value="all">همه گردش‌ها</option>
            {[...new Set(b.moves.map((m) => m.kind))].map((k) => (
              <option value={k} key={k}>
                {labels[k]}
              </option>
            ))}
          </select>
        </SectionHead>
        <GridTable
          heads={['تاریخ', 'دسته‌بندی', 'نوع گردش', 'تعداد کارتن', 'شرح']}
          rows={b.moves
            .filter((m) => filter === 'all' || m.kind === filter)
            .map((m) => [
              dateFa(m.date),
              products.find((p) => p.id === m.productId)!.name,
              <span className={'tag ' + (m.qty > 0 ? 'jade' : 'amber')}>{labels[m.kind]}</span>,
              fa(m.qty),
              m.reason,
            ])}
        />
      </section>
    </>
  );
}
export function ProductPage() {
  const { book: b, open } = useDesk(),
    { id } = useParams(),
    p = b.products.find((p) => p.id === id),
    [tab, set] = useState('moves');
  if (!p) return <NotFound />;
  const s = stock(b, p.id);
  return (
    <>
      <Back to="/inventory" name="انبار" />
      <Heading title={p.name} sub={p.weight + ' · ارزش‌گذاری به روش اولین وارده، اولین صادره'}>
        <button className="btn secondary" onClick={() => open('product', p.id)}>
          <PenLine size={15} />
          ویرایش کالا
        </button>
        <button className="btn primary" onClick={() => open('adjust', p.id)}>
          <ClipboardCheck size={15} />
          اصلاح موجودی
        </button>
      </Heading>
      <div className="metrics three">
        <Metric label="موجودی قابل فروش" value={s.qty} unit="کارتن" color="amber" icon={Package} />
        <Metric label="بهای متوسط هر کارتن" value={s.average} icon={Layers3} />
        <Metric label="ارزش کل موجودی" value={s.value} color="blue" icon={Wallet} />
      </div>
      <section className="card">
        <SectionHead title="خلاصه کالا" />
        <div className="summary-grid">
          {[
            ['خرید', s.purchased],
            ['فروش', s.sold],
            ['برگشت فروش', s.saleReturn],
            ['برگشت خرید', s.purchaseReturn],
            ['ضایعات', s.damaged],
          ].map(([l, v]) => (
            <div key={l}>
              <small>{l}</small>
              <b>
                {fa(Number(v))} <em>کارتن</em>
              </b>
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <div className="tabs">
          {[
            ['moves', 'گردش کالا'],
            ['batches', 'بچ‌های ورودی'],
            ['sales', 'سابقه فروش'],
            ['count', 'سوابق شمارش'],
          ].map(([k, l]) => (
            <button key={k} className={tab === k ? 'active' : ''} onClick={() => set(k)}>
              {l}
            </button>
          ))}
        </div>
        {tab === 'moves' ? (
          <GridTable
            heads={['تاریخ', 'گردش', 'تعداد', 'شرح', 'شناسه سند']}
            rows={b.moves
              .filter((m) => m.productId === p.id)
              .map((m) => [
                dateFa(m.date),
                labels[m.kind],
                fa(m.qty),
                m.reason,
                m.docId.slice(0, 8),
              ])}
          />
        ) : tab === 'batches' ? (
          <GridTable
            heads={['تاریخ', 'شناسه بچ', 'تعداد اولیه', 'مانده', 'قیمت خرید']}
            rows={b.batches
              .filter((m) => m.productId === p.id)
              .sort((a, c) => a.date - c.date)
              .map((m) => [
                dateFa(m.date),
                m.id.slice(0, 8),
                fa(m.quantity),
                fa(m.remaining),
                fa(m.unitCost),
              ])}
          />
        ) : tab === 'sales' ? (
          <DocTable
            docs={b.sales.filter((i) =>
              b.saleItems.some((l) => l.invoiceId === i.id && l.productId === p.id),
            )}
          />
        ) : (
          <GridTable
            heads={['تاریخ', 'قبل', 'بعد', 'اختلاف', 'دلیل']}
            rows={b.adjust
              .filter((a) => a.target === p.id)
              .map((a) => [dateFa(a.date), fa(a.before), fa(a.actual), fa(a.diff), a.reason])}
          />
        )}
      </section>
    </>
  );
}
