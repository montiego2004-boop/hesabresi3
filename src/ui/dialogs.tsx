import {
  ArrowLeft,
  ChevronDown,
  Download,
  FileSignature,
  Package,
  Plus,
  Smartphone,
  Trash2,
  Upload,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { useRef, useState, type PointerEvent as ReactPointer } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  addBank,
  adjustStock,
  allocatePayment,
  cashOperation,
  createInvoice,
  readMedia,
  recordPayment,
  returnInvoice,
  reverseMoney,
  saveParty,
  saveProduct,
  type AdjustInput,
  type CashInput,
} from '../core/engine';
import {
  check,
  fa,
  id,
  inputDate,
  labels,
  norm,
  numberOf,
  sum,
  type Role,
  type Side,
} from '../core/model';
import { docDue, partyBalance, stock, walletTotal } from '../core/reports';
import { DateField, Field, Find, Form, Modal, NumberField, message } from './common';
import { useDesk, type Dialog } from './context';
import { navGroups } from './nav';
import { canInstall, promptInstall, standalone } from './pwa';
const str = (f: FormData, k: string) => String(f.get(k) || '').trim();
const num = (s: string) => {
  try {
    return numberOf(s);
  } catch {
    return 0;
  }
};
export function Dialogs({ dialog: d }: { dialog: Dialog }) {
  const { close } = useDesk();
  const role = d.kind === 'customer' || d.kind === 'supplier';
  const title = role
    ? (d.arg ? 'ویرایش ' : 'ثبت ') + labels[d.kind]
    : (
        {
          sale: 'ثبت فاکتور فروش',
          purchase: 'ثبت فاکتور خرید',
          payment: 'دریافت و پرداخت وجه',
          cash: 'ثبت عملیات مالی',
          adjust: 'شمارش و اصلاح موجودی',
          product: 'ویرایش دسته‌بندی کالا',
          bank: 'افزودن حساب بانکی',
          return: d.extra === 'reverse' ? 'ابطال فاکتور' : 'برگشت کالا',
          allocate: 'تخصیص مانده پرداخت',
          search: 'جست‌وجو در فضای کاری',
          install: 'نصب دانه‌حساب',
          reverseMoney: 'ابطال گردش مالی',
        } as Record<string, string>
      )[d.kind];
  return (
    <Modal
      title={title}
      subtitle={
        ['sale', 'purchase'].includes(d.kind)
          ? 'اطلاعات فاکتور را وارد و پیش از ثبت نهایی بررسی کنید.'
          : undefined
      }
      onClose={close}
      large={['sale', 'purchase'].includes(d.kind)}
    >
      {role ? (
        <PartyForm role={d.kind as Role} arg={d.arg} next={d.extra} />
      ) : d.kind === 'sale' || d.kind === 'purchase' ? (
        <InvoiceForm side={d.kind} partyId={d.arg} />
      ) : d.kind === 'payment' ? (
        <PayForm initial={d.arg as Role} partyId={d.extra} />
      ) : d.kind === 'cash' ? (
        <CashForm initial={d.arg} />
      ) : d.kind === 'adjust' ? (
        <AdjustForm initial={d.arg} />
      ) : d.kind === 'product' ? (
        <ProductForm productId={d.arg!} />
      ) : d.kind === 'bank' ? (
        <BankForm />
      ) : d.kind === 'return' ? (
        <ReturnForm docId={d.arg!} reverse={d.extra === 'reverse'} />
      ) : d.kind === 'allocate' ? (
        <AllocateForm paymentId={d.arg!} />
      ) : d.kind === 'reverseMoney' ? (
        <ReverseMoneyForm docId={d.arg!} />
      ) : d.kind === 'search' ? (
        <GlobalSearch />
      ) : (
        <InstallGuide />
      )}
    </Modal>
  );
}
function PartyForm({ role, arg, next }: { role: Role; arg?: string; next?: string }) {
  const { book: b, open } = useDesk(),
    p = (role === 'customer' ? b.customers : b.suppliers).find((p) => p.id === arg);
  return (
    <Form
      submit={async (f, key) => {
        const fields = Object.fromEntries(
          ['name', 'phone', 'address', 'delivery', 'location', 'instructions', 'time', 'notes'].map(
            (k) => [k, str(f, k)],
          ),
        );
        return saveParty(
          role,
          { ...fields, name: fields.name, id: p?.id },
          numberOf(f.get('opening')) * (f.get('direction') === 'credit' ? -1 : 1),
          key,
        );
      }}
      onDone={(v) => {
        if (next === 'sale' || next === 'purchase') open(next, v);
      }}
    >
      <div className="form-grid">
        <Field label="نام و نام خانوادگی یا مجموعه *">
          <input
            name="name"
            required
            maxLength={120}
            defaultValue={p?.name}
            placeholder="نام طرف حساب"
          />
        </Field>
        <Field label="شماره تماس">
          <input name="phone" type="tel" dir="auto" defaultValue={p?.phone} placeholder="۰۹۱۲…" />
        </Field>
        <Field label={role === 'customer' ? 'نشانی فروشگاه' : 'نشانی تأمین‌کننده'} wide>
          <input name="address" defaultValue={p?.address} placeholder="شهر، خیابان، پلاک" />
        </Field>
        {role === 'customer' && (
          <>
            <Field label="نشانی تحویل" wide>
              <input
                name="delivery"
                defaultValue={p?.delivery}
                placeholder="نشانی محل دریافت بار"
              />
            </Field>
            <Field label="موقعیت تحویل">
              <input name="location" defaultValue={p?.location} placeholder="نام مکان یا مختصات" />
            </Field>
            <Field label="زمان ترجیحی تحویل">
              <input name="time" defaultValue={p?.time} placeholder="مثلاً ۸ تا ۱۰ صبح" />
            </Field>
            <Field label="راهنمای تحویل" wide>
              <input
                name="instructions"
                defaultValue={p?.instructions}
                placeholder="توضیحات مربوط به تحویل بار"
              />
            </Field>
          </>
        )}
        {!p && (
          <>
            <NumberField name="opening" label="مانده اول دوره (تومان)" />
            <Field label="ماهیت مانده">
              <select name="direction">
                <option value="debt">
                  {role === 'customer' ? 'بدهی مشتری' : 'بدهی به تأمین‌کننده'}
                </option>
                <option value="credit">
                  {role === 'customer' ? 'اعتبار مشتری' : 'پیش‌پرداخت به تأمین‌کننده'}
                </option>
              </select>
            </Field>
          </>
        )}
        <Field label="یادداشت" wide>
          <textarea name="notes" defaultValue={p?.notes} rows={2} />
        </Field>
      </div>
    </Form>
  );
}
function Signature({ name, onChange }: { name: string; onChange: (s: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null),
    drawing = useRef(false),
    [preview, setPreview] = useState(''),
    [err, setErr] = useState('');
  const pos = (e: ReactPointer<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 640, ((e.clientY - r.top) / r.height) * 220];
  };
  const clear = () => {
    ref.current?.getContext('2d')?.clearRect(0, 0, 640, 220);
    setPreview('');
    onChange('');
  };
  return (
    <div className="signature">
      <div className="inline-between">
        <b>{name}</b>
        <button type="button" className="mini" onClick={clear}>
          پاک کردن
        </button>
      </div>
      {preview ? (
        <img src={preview} alt={name} />
      ) : (
        <canvas
          aria-label={name}
          width={640}
          height={220}
          ref={ref}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            const c = e.currentTarget.getContext('2d')!,
              [x, y] = pos(e);
            c.strokeStyle = '#173740';
            c.lineWidth = 3;
            c.lineCap = 'round';
            c.beginPath();
            c.moveTo(x, y);
            c.lineTo(x + 0.1, y + 0.1);
            c.stroke();
            drawing.current = true;
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const c = e.currentTarget.getContext('2d')!,
              [x, y] = pos(e);
            c.lineTo(x, y);
            c.stroke();
          }}
          onPointerUp={() => {
            if (drawing.current) {
              drawing.current = false;
              onChange(ref.current!.toDataURL('image/png'));
            }
          }}
          onPointerCancel={() => {
            drawing.current = false;
          }}
        />
      )}
      <label className="mini upload-mini">
        <Upload size={13} />
        انتخاب تصویر امضا
        <input
          type="file"
          accept="image/png,image/jpeg"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const m = await readMedia(file, true);
              setPreview(m.data);
              onChange(m.data);
              setErr('');
            } catch (x) {
              setErr(message(x));
            }
          }}
        />
      </label>
      {err && <small className="red-text">{err}</small>}
    </div>
  );
}
function InvoiceForm({ side, partyId = '' }: { side: Side; partyId?: string }) {
  const { book: b, open, confirm } = useDesk(),
    go = useNavigate(),
    sale = side === 'sale',
    list = sale ? b.customers : b.suppliers,
    products = [...b.products].sort(
      (a, c) => a.createdAt - c.createdAt || a.name.localeCompare(c.name, 'fa'),
    );
  const suggested = (productId: string) =>
    String(
      (sale
        ? b.products.find((p) => p.id === productId)?.salePrice
        : b.purchases
            .map(
              (i) =>
                b.purchaseItems.find((l) => l.invoiceId === i.id && l.productId === productId)
                  ?.price,
            )
            .find(Boolean)) || '',
    );
  const [who, setWho] = useState(partyId),
    [lines, setLines] = useState([
      {
        key: id(),
        productId: products[0]?.id || '',
        qty: '۱',
        price: suggested(products[0]?.id || ''),
      },
    ]),
    [discount, sd] = useState(''),
    [fee, sf] = useState(''),
    [mode, sm] = useState('credit'),
    [paid, sp] = useState(''),
    [buyer, sb] = useState(''),
    [seller, ss] = useState('');
  const rawGross = lines.reduce((v, l) => v + num(l.qty) * num(l.price), 0),
    gross = Number.isSafeInteger(rawGross) ? rawGross : 0,
    total = gross - num(discount) + num(fee),
    amount = mode === 'full' ? total : mode === 'partial' ? num(paid) : 0;
  const set = (key: string, k: string, v: string) =>
    setLines(
      lines.map((l) =>
        l.key !== key ? l : { ...l, [k]: v, ...(k === 'productId' ? { price: suggested(v) } : {}) },
      ),
    );
  return (
    <Form
      label="بررسی و ثبت فاکتور"
      disabled={!list.length}
      submit={async (f, key) => {
        const l = lines.map((x) => ({
          productId: x.productId,
          qty: numberOf(x.qty),
          price: numberOf(x.price),
        }));
        check(who, 'طرف حساب را انتخاب کنید.');
        check(
          Number.isSafeInteger(rawGross) && Number.isSafeInteger(total),
          'مبلغ از محدوده مجاز بیشتر است.',
        );
        check(
          l.every((x) => x.qty > 0 && x.price > 0),
          'تعداد و قیمت همه ردیف‌ها باید بیشتر از صفر باشد.',
        );
        if (
          !(await confirm(
            `فاکتور ${labels[side]} به مبلغ ${fa(total)} تومان برای ${list.find((p) => p.id === who)?.name} ثبت شود؟`,
          ))
        )
          return false;
        const file = f.get('attachment') as File | null;
        return createInvoice(
          {
            side,
            partyId: who,
            date: inputDate(str(f, 'date')),
            lines: l,
            discount: numberOf(discount),
            fee: numberOf(fee),
            paid: mode === 'partial' ? numberOf(paid) : amount,
            walletId: str(f, 'walletId') || 'cash',
            notes: str(f, 'notes'),
            signatures: { buyer, seller },
            attachment: file?.size ? await readMedia(file) : undefined,
          },
          key,
        );
      }}
      onDone={(v) => go(`/${sale ? 'sales' : 'purchases'}/${v}`)}
    >
      <div className="form-grid">
        <Field label={sale ? 'مشتری *' : 'تأمین‌کننده *'}>
          <select
            aria-label={sale ? 'مشتری' : 'تأمین‌کننده'}
            required
            value={who}
            onChange={(e) => setWho(e.target.value)}
          >
            <option value="">انتخاب {sale ? 'مشتری' : 'تأمین‌کننده'}</option>
            {list.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <DateField />
      </div>
      {!list.length && (
        <div className="alert info inline-between">
          ابتدا یک {sale ? 'مشتری' : 'تأمین‌کننده'} ثبت کنید.
          <button
            type="button"
            className="text-link"
            onClick={() => open(sale ? 'customer' : 'supplier', undefined, side)}
          >
            <UserPlus size={15} />
            ثبت طرف حساب
          </button>
        </div>
      )}
      <div className="form-section-title">
        <Package size={17} />
        <h3>اقلام فاکتور</h3>
      </div>
      {lines.map((l, i) => (
        <div key={l.key} className="invoice-line">
          <Field label={`کالای ردیف ${fa(i + 1)}`}>
            <select value={l.productId} onChange={(e) => set(l.key, 'productId', e.target.value)}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <NumberField
            label="تعداد کارتن"
            value={l.qty}
            onChange={(v) => set(l.key, 'qty', v)}
            required
          />
          <NumberField
            label="قیمت واحد (تومان)"
            value={l.price}
            onChange={(v) => set(l.key, 'price', v)}
            required
          />
          <button
            type="button"
            className="icon-btn"
            aria-label="حذف ردیف"
            disabled={lines.length === 1}
            onClick={() => setLines(lines.filter((x) => x.key !== l.key))}
          >
            <Trash2 size={16} />
          </button>
          <small>
            موجودی: {fa(stock(b, l.productId).qty)} کارتن{' '}
            <span>مبلغ ردیف: {fa(num(l.qty) * num(l.price))} تومان</span>
          </small>
        </div>
      ))}
      <button
        type="button"
        className="btn dashed"
        onClick={() =>
          setLines([
            ...lines,
            { key: id(), productId: products[0].id, qty: '۱', price: suggested(products[0].id) },
          ])
        }
      >
        <Plus size={15} />
        افزودن ردیف کالا
      </button>
      {sale && (
        <div className="form-grid">
          <NumberField label="تخفیف (تومان)" value={discount} onChange={sd} />
          <NumberField label="هزینه اضافی (تومان)" value={fee} onChange={sf} />
        </div>
      )}
      <div className="form-section-title">
        <Wallet size={17} />
        <h3>اطلاعات تسویه</h3>
      </div>
      <div className="form-grid">
        <Field label="نوع تسویه">
          <select value={mode} onChange={(e) => sm(e.target.value)}>
            <option value="credit">اعتباری / بدون پرداخت</option>
            <option value="full">تسویه کامل</option>
            <option value="partial">پرداخت بخشی از مبلغ</option>
          </select>
        </Field>
        {mode !== 'credit' && <WalletField />}
        {mode === 'partial' && (
          <NumberField label="مبلغ پرداخت (تومان)" value={paid} onChange={sp} required />
        )}
      </div>
      <div className="bill-summary">
        <span>مبلغ نهایی فاکتور</span>
        <b>
          {fa(total)} <small>تومان</small>
        </b>
      </div>
      {who && (
        <p className="muted">
          مانده قبلی: {fa(partyBalance(b, sale ? 'customer' : 'supplier', who))} · مانده پس از ثبت:{' '}
          {fa(partyBalance(b, sale ? 'customer' : 'supplier', who) + total - amount)} تومان
        </p>
      )}
      <details className="expand">
        <summary>
          <FileSignature size={16} />
          یادداشت، پیوست و امضا <ChevronDown size={15} />
        </summary>
        <div className="form-grid">
          <Field label="یادداشت فاکتور" wide>
            <textarea name="notes" rows={2} />
          </Field>
          <Field label="پیوست محلی (تصویر یا پی‌دی‌اف)" wide>
            <input name="attachment" type="file" accept="image/jpeg,image/png,application/pdf" />
          </Field>
          {sale && (
            <>
              <Signature name="امضای خریدار" onChange={sb} />
              <Signature name="امضای فروشنده" onChange={ss} />
            </>
          )}
        </div>
      </details>
    </Form>
  );
}
function WalletField({
  name = 'walletId',
  label = 'حساب پرداخت',
  value,
  onChange,
}: {
  name?: string;
  label?: string;
  value?: string;
  onChange?: (v: string) => void;
}) {
  const { book: b } = useDesk();
  return (
    <Field label={label}>
      <select
        name={name}
        {...(onChange ? { value, onChange: (e: any) => onChange(e.target.value) } : {})}
      >
        {b.wallets.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
function PayForm({ initial = 'customer', partyId = '' }: { initial?: Role; partyId?: string }) {
  const { book: b, confirm, open } = useDesk(),
    [role, sr] = useState<Role>(initial),
    [who, sw] = useState(partyId),
    [refund, setRefund] = useState(false);
  const list = role === 'customer' ? b.customers : b.suppliers,
    docs = (role === 'customer' ? b.sales : b.purchases).filter(
      (i) => i.partyId === who && docDue(b, i) > 0,
    );
  return (
    <Form
      label="ثبت پرداخت"
      submit={async (f, key) => {
        const amount = numberOf(f.get('amount'));
        if (!(await confirm(`گردش وجه به مبلغ ${fa(amount)} تومان ثبت شود؟`, refund))) return false;
        return recordPayment(
          {
            role,
            partyId: who,
            date: inputDate(str(f, 'date')),
            amount,
            walletId: str(f, 'walletId'),
            notes: str(f, 'notes'),
            refund,
            allocation: str(f, 'allocation') || 'auto',
          },
          key,
        );
      }}
    >
      <div className="segmented">
        {(['customer', 'supplier'] as const).map((k) => (
          <button
            type="button"
            key={k}
            className={role === k ? 'active' : ''}
            onClick={() => {
              sr(k);
              sw('');
            }}
          >
            {k === 'customer' ? 'حساب مشتری' : 'حساب تأمین‌کننده'}
          </button>
        ))}
      </div>
      <div className="form-grid">
        <Field label="طرف حساب *">
          <select required value={who} onChange={(e) => sw(e.target.value)}>
            <option value="">انتخاب طرف حساب</option>
            {list.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="نوع عملیات">
          <select
            value={refund ? 'refund' : 'normal'}
            onChange={(e) => setRefund(e.target.value === 'refund')}
          >
            <option value="normal">
              {role === 'customer' ? 'دریافت از مشتری' : 'پرداخت به تأمین‌کننده'}
            </option>
            <option value="refund">
              {role === 'customer' ? 'استرداد اعتبار مشتری' : 'استرداد از تأمین‌کننده'}
            </option>
          </select>
        </Field>
        <NumberField name="amount" label="مبلغ (تومان) *" required />
        <WalletField />
        <DateField />
        {!refund && (
          <Field label="تخصیص پرداخت">
            <select name="allocation">
              <option value="auto">قدیمی‌ترین فاکتورهای باز</option>
              <option value="advance">علی‌الحساب (بدون تخصیص)</option>
              {docs.map((i) => (
                <option key={i.id} value={i.id}>
                  اولویت: {i.number}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="شرح عملیات" wide>
          <input name="notes" placeholder="توضیح اختیاری" />
        </Field>
      </div>
      {!list.length && (
        <button type="button" className="text-link" onClick={() => open(role)}>
          ثبت اولین طرف حساب <ArrowLeft size={14} />
        </button>
      )}
      {who && (
        <div className="bill-summary">
          مانده حساب فعلی <b>{fa(partyBalance(b, role, who))} تومان</b>
        </div>
      )}
    </Form>
  );
}
function CashForm({ initial = 'deposit' }: { initial?: string }) {
  const { book: b, confirm } = useDesk(),
    [kind, set] = useState(initial),
    [wallet, sw] = useState('cash'),
    [v, sv] = useState('');
  const close = kind === 'closing' || kind === 'correction',
    before = walletTotal(b, wallet);
  return (
    <Form
      label="تأیید عملیات مالی"
      submit={async (f, key) => {
        if (
          !(await confirm(
            `${labels[kind]} برای ${b.wallets.find((w) => w.id === wallet)?.name} با مبلغ ${fa(num(v))} تومان ثبت شود؟`,
            close || kind === 'opening',
          ))
        )
          return false;
        return cashOperation(
          {
            kind: kind as CashInput['kind'],
            walletId: wallet,
            toId: str(f, 'toId'),
            amount: numberOf(v),
            date: inputDate(str(f, 'date')),
            reason: str(f, 'reason'),
            expected: close ? before : undefined,
          },
          key,
        );
      }}
    >
      <div className="form-grid">
        <Field label="نوع تراکنش">
          <select value={kind} onChange={(e) => set(e.target.value)}>
            {['deposit', 'expense', 'withdraw', 'transfer', 'opening', 'closing', 'correction'].map(
              (k) => (
                <option key={k} value={k}>
                  {labels[k]}
                </option>
              ),
            )}
          </select>
        </Field>
        <WalletField label="حساب مبدأ" value={wallet} onChange={sw} />
        {kind === 'transfer' && <WalletField name="toId" label="حساب مقصد" />}
        <NumberField
          label={close ? 'موجودی واقعی شمارش‌شده (تومان)' : 'مبلغ (تومان) *'}
          value={v}
          onChange={sv}
          required
        />
        <DateField />
        <Field label="شرح و دلیل عملیات *" wide>
          <textarea name="reason" rows={2} required />
        </Field>
      </div>
      <div className="bill-summary">
        مانده فعلی حساب <b>{fa(before)} تومان</b>
      </div>
      {close && (
        <p className="muted">
          اختلاف شمارش: {fa(num(v) - before)} تومان. نتیجه شمارش و سند اصلاحی نگهداری می‌شود.
        </p>
      )}
    </Form>
  );
}
function AdjustForm({ initial }: { initial?: string }) {
  const { book: b, confirm } = useDesk(),
    [p, sp] = useState(initial || 'light'),
    [kind, sk] = useState('count'),
    [qty, sq] = useState(''),
    st = stock(b, p),
    diff =
      kind === 'count'
        ? num(qty) - st.qty
        : (['damage', 'adjustDown', 'otherDown'].includes(kind) ? -1 : 1) * num(qty);
  return (
    <Form
      label="ثبت اصلاح موجودی"
      submit={async (f, key) => {
        if (
          !(await confirm(
            `موجودی از ${fa(st.qty)} به ${fa(st.qty + diff)} کارتن تغییر کند؟ این عملیات خرید نیست و سابقه آن حفظ می‌شود.`,
            true,
          ))
        )
          return false;
        return adjustStock(
          {
            productId: p,
            kind: kind as AdjustInput['kind'],
            qty: numberOf(qty),
            unitCost: numberOf(f.get('cost')),
            reason: str(f, 'reason'),
            date: inputDate(str(f, 'date')),
            expected: st.qty,
          },
          key,
        );
      }}
    >
      <div className="form-grid">
        <Field label="دسته‌بندی کالا">
          <select value={p} onChange={(e) => sp(e.target.value)}>
            {b.products.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="نوع اصلاح">
          <select value={kind} onChange={(e) => sk(e.target.value)}>
            {[
              'count',
              'openingStock',
              'damage',
              'adjustUp',
              'adjustDown',
              'otherUp',
              'otherDown',
            ].map((k) => (
              <option key={k} value={k}>
                {k === 'count' ? 'شمارش فیزیکی انبار' : labels[k]}
              </option>
            ))}
          </select>
        </Field>
        <NumberField
          label={kind === 'count' ? 'تعداد واقعی شمارش‌شده' : 'تعداد کارتن'}
          value={qty}
          onChange={sq}
          required
        />
        <DateField />
        {diff > 0 && (
          <NumberField
            key={p}
            label="بهای هر کارتن ورودی (تومان)"
            name="cost"
            value={String(st.average)}
            required
          />
        )}
        <Field label="دلیل و مرجع اصلاح *" wide>
          <textarea required name="reason" rows={2} />
        </Field>
      </div>
      <div className="bill-summary">
        <span>سیستم: {fa(st.qty)} کارتن</span>
        <b>
          {diff >= 0 ? 'افزایش' : 'کاهش'}: {fa(Math.abs(diff))} کارتن
        </b>
      </div>
    </Form>
  );
}
function ProductForm({ productId }: { productId: string }) {
  const { book: b, confirm } = useDesk(),
    p = b.products.find((x) => x.id === productId)!;
  return (
    <Form
      submit={async (f, key) => {
        if (
          !(await confirm(
            'اطلاعات دسته‌بندی برای ثبت‌های بعدی تغییر کند؟ فاکتورهای گذشته تغییر نمی‌کنند.',
            true,
          ))
        )
          return false;
        return saveProduct(
          {
            ...p,
            name: str(f, 'name'),
            weight: str(f, 'weight'),
            salePrice: numberOf(f.get('salePrice')),
          },
          key,
        );
      }}
    >
      <div className="form-grid">
        <Field label="نام کالا">
          <input required name="name" defaultValue={p.name} />
        </Field>
        <Field label="محدوده وزن">
          <input required name="weight" defaultValue={p.weight} />
        </Field>
        <NumberField
          label="قیمت فروش پیشنهادی (تومان)"
          name="salePrice"
          value={String(p.salePrice)}
        />
      </div>
    </Form>
  );
}
function BankForm() {
  return (
    <Form submit={(f, key) => addBank(str(f, 'name'), key)}>
      <Field label="نام حساب بانکی">
        <input required name="name" placeholder="مثلاً بانک ملت" />
      </Field>
    </Form>
  );
}
function ReturnForm({ docId, reverse }: { docId: string; reverse: boolean }) {
  const { book: b, confirm } = useDesk(),
    inv = [...b.sales, ...b.purchases].find((i) => i.id === docId)!,
    lines = (inv.side === 'sale' ? b.saleItems : b.purchaseItems).filter(
      (l) => l.invoiceId === docId,
    ),
    prior = b.returns.filter((r) => r.invoiceId === docId).flatMap((r) => r.items),
    available = (l: (typeof lines)[0]) =>
      l.qty -
      sum(
        prior.filter((x) => x.itemId === l.id),
        (x) => x.qty,
      );
  return (
    <Form
      label={reverse ? 'ابطال و صدور سند معکوس' : 'ثبت برگشت کالا'}
      submit={async (f, key) => {
        if (
          !(await confirm(
            'سند برگشت ثبت شود؟ وجه تسویه‌شده به اعتبار طرف حساب منتقل می‌شود؛ بازپرداخت وجه جداگانه است.',
            true,
          ))
        )
          return false;
        return returnInvoice(
          inv.side,
          inv.id,
          lines
            .map((l) => ({ itemId: l.id, qty: reverse ? available(l) : numberOf(f.get(l.id)) }))
            .filter((l) => l.qty > 0),
          str(f, 'reason'),
          reverse,
          key,
        );
      }}
    >
      <div className="alert info">
        فاکتور {inv.number} حذف نمی‌شود؛ گردش معکوس با بهای اصلی ثبت خواهد شد.
      </div>
      <div className="form-grid">
        {lines.map((l) => (
          <div key={l.id}>
            {reverse ? (
              <p>
                {l.name} · {fa(available(l))} کارتن
              </p>
            ) : (
              <NumberField
                label={l.name}
                name={l.id}
                hint={'قابل برگشت: ' + fa(available(l)) + ' کارتن'}
              />
            )}
          </div>
        ))}
        <Field label="دلیل برگشت یا ابطال *" wide>
          <textarea required name="reason" rows={2} />
        </Field>
      </div>
    </Form>
  );
}
function AllocateForm({ paymentId }: { paymentId: string }) {
  const { book: b, confirm } = useDesk(),
    p = b.payments.find((p) => p.id === paymentId)!,
    list = (p.role === 'customer' ? b.sales : b.purchases).filter(
      (i) => i.partyId === p.partyId && docDue(b, i) > 0,
    ),
    free =
      p.amount -
      sum(
        b.allocations.filter((a) => a.paymentId === p.id),
        (a) => a.amount,
      );
  return (
    <Form
      disabled={!list.length || !free}
      submit={async (f, key) => {
        if (!(await confirm('مبالغ واردشده به فاکتورها تخصیص داده شوند؟'))) return false;
        await allocatePayment(
          p.id,
          list
            .map((i) => ({ invoiceId: i.id, amount: numberOf(f.get(i.id)) }))
            .filter((l) => l.amount > 0),
          key,
        );
      }}
    >
      <div className="bill-summary">
        مبلغ تخصیص‌نیافته <b>{fa(free)} تومان</b>
      </div>
      {list.map((i) => (
        <NumberField
          key={i.id}
          name={i.id}
          label={'فاکتور ' + i.number}
          hint={'مانده: ' + fa(docDue(b, i)) + ' تومان'}
        />
      ))}
      {!list.length && <p>فاکتور بازی برای این طرف حساب وجود ندارد.</p>}
    </Form>
  );
}
function GlobalSearch() {
  const { book: b, close } = useDesk(),
    go = useNavigate(),
    [q, set] = useState(''),
    list = [
      ...navGroups
        .flatMap((g) => g.items)
        .map((n) => ({ title: n.name, sub: 'بخش برنامه', path: n.path })),
      ...b.customers.map((p) => ({
        title: p.name,
        sub: p.phone + ' ' + p.address + ' ' + p.delivery,
        path: '/customers/' + p.id,
      })),
      ...b.suppliers.map((p) => ({
        title: p.name,
        sub: p.phone + ' ' + p.address,
        path: '/suppliers/' + p.id,
      })),
      ...[...b.sales, ...b.purchases].map((i) => ({
        title: i.number,
        sub: i.party.name,
        path: (i.side === 'sale' ? '/sales/' : '/purchases/') + i.id,
      })),
    ]
      .filter((i) =>
        norm(i.title + ' ' + i.sub)
          .toLowerCase()
          .includes(norm(q).toLowerCase()),
      )
      .slice(0, 25);
  return (
    <div className="modal-body">
      <Find placeholder="جست‌وجوی بخش، طرف حساب یا شماره فاکتور…" value={q} onChange={set} />
      <div className="search-results">
        {list.map((i) => (
          <button
            key={i.path}
            onClick={() => {
              close();
              go(i.path);
            }}
          >
            <div>
              <b>{i.title}</b>
              <small>{i.sub}</small>
            </div>
            <ArrowLeft size={15} />
          </button>
        ))}
        {!list.length && <p>نتیجه‌ای پیدا نشد.</p>}
      </div>
    </div>
  );
}
export function InstallGuide() {
  const { offlineReady, notice } = useDesk();
  return (
    <div className="modal-body guide">
      <div className="guide-banner">
        <Smartphone size={30} />
        <div>
          <b>دانه‌حساب روی صفحه اصلی</b>
          <p>وب‌اپلیکیشن مستقل، بدون نیاز به حساب کاربری</p>
        </div>
      </div>
      <ol>
        <li>نشانی برنامه را با کروم اندروید و اتصال امن باز کنید.</li>
        <li>صبر کنید تا وضعیت «آماده استفاده آفلاین» نمایش داده شود.</li>
        <li>از منوی سه‌نقطه، «نصب برنامه» یا «افزودن به صفحه اصلی» را انتخاب کنید.</li>
        <li>
          برنامه را از آیکون دانه‌حساب اجرا کنید. پس از آماده شدن، قطع اینترنت مانع ثبت عملیات نیست.
        </li>
      </ol>
      <div className={'alert ' + (offlineReady ? 'success' : 'info')}>
        {standalone()
          ? 'در حال اجرا در حالت مستقل'
          : offlineReady
            ? 'آماده استفاده آفلاین'
            : 'در انتظار آماده‌سازی پوسته آفلاین'}
      </div>
      {canInstall() && (
        <button
          className="btn primary"
          onClick={async () => {
            if (await promptInstall()) notice('درخواست نصب پذیرفته شد.');
          }}
        >
          <Download size={16} />
          نصب روی دستگاه
        </button>
      )}
      <p className="muted">
        این برنامه یک وب‌اپ است، نه فایل نصب اندروید. از مرورگر خصوصی استفاده نکنید. حذف داده‌های
        سایت می‌تواند دفتر شما را پاک کند؛ نسخه پشتیبان را خارج از برنامه ذخیره کنید.
      </p>
    </div>
  );
}

function ReverseMoneyForm({ docId }: { docId: string }) {
  const { confirm } = useDesk();
  return (
    <Form
      label="ثبت سند معکوس"
      submit={async (f, key) => {
        if (
          !(await confirm(
            'گردش نقدی و ثبت حسابداری این سند معکوس شود؟ اصل سند باقی می‌ماند و تخصیص تسویه مربوط آزاد می‌شود.',
            true,
          ))
        )
          return false;
        return reverseMoney(docId, str(f, 'reason'), key);
      }}
    >
      <div className="alert info">
        از این عملیات برای اصلاح ثبت اشتباه استفاده کنید. برای پس دادن وجه مشتری بستانکار، عملیات
        استرداد را انتخاب کنید.
      </div>
      <Field label="دلیل ابطال *">
        <textarea required rows={3} name="reason" />
      </Field>
    </Form>
  );
}
