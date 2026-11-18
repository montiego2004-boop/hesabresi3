import {
  ArrowUpLeft,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  LoaderCircle,
  Search,
  ShieldCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { dateFa, fa, id, isoDate } from '../core/model';
import { useDesk } from './context';
export function BrandMark() {
  return (
    <svg viewBox="0 0 45 48" fill="none" className="brand-mark" aria-hidden="true">
      <path
        d="M26 3C19 1 6 19 5 30c-1 10 5 16 15 16 11 0 18-7 18-17 0-11-6-24-12-26Z"
        fill="#f4f5e9"
      />
      <path d="M16 29c0-5 4-9 9-8 5 0 9 5 8 10-1 6-6 9-11 8-5-1-7-5-6-10Z" fill="#e7b34c" />
    </svg>
  );
}
export function EggIcon({ tone = 'standard' }: { tone?: string }) {
  const key = useId().replace(/:/g, '');
  const c =
    tone === 'light'
      ? ['#ffedc5', '#ddb57a', '#c39760']
      : tone === 'heavy'
        ? ['#e6b68a', '#bd855c', '#946044']
        : ['#ffe4b2', '#deb07b', '#bc8b59'];
  return (
    <span className={'egg-avatar ' + tone}>
      <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <defs>
          <radialGradient id={key} cx="30%" cy="30%" r="86%">
            <stop stopColor={c[0]} />
            <stop offset=".7" stopColor={c[1]} />
            <stop offset="1" stopColor={c[2]} />
          </radialGradient>
        </defs>
        <ellipse cx="25" cy="38" rx="15" ry="2.6" fill="#583f20" opacity=".09" />
        <path
          d="M23 11c-4-1-11 9-12 16-1 6 2 10 7 11 7 1 12-3 12-10 0-7-3-16-7-17Z"
          fill={`url(#${key})`}
        />
        <path
          d="M30 15c-4 0-8 10-8 15 0 6 4 9 10 8 5-1 7-4 6-9-1-7-5-15-8-14Z"
          fill={`url(#${key})`}
        />
      </svg>
    </span>
  );
}
export function Heading({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}
export function Metric({
  label,
  value,
  unit = 'تومان',
  icon: Icon,
  color = 'jade',
  onClick,
}: {
  label: string;
  value: number;
  unit?: string;
  icon: LucideIcon;
  color?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="metric-top">
        <span className={'icon-box ' + color}>
          <Icon size={20} strokeWidth={1.7} />
        </span>
        {onClick && <ArrowUpLeft className="metric-arrow" size={15} />}
      </div>
      <span className="metric-label">{label}</span>
      <div className="metric-value">
        <b>{fa(value)}</b>
        <small>{unit}</small>
      </div>
    </>
  );
  return onClick ? (
    <button className={'metric card ' + color} onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className={'metric card ' + color}>{content}</div>
  );
}
export function SectionHead({
  title,
  sub,
  children,
  icon: Icon,
}: {
  title: string;
  sub?: string;
  children?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="section-head">
      <div>
        <h2>
          {Icon && <Icon size={18} />} {title}
        </h2>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </div>
  );
}
export function Empty({
  title = 'هنوز رکوردی ثبت نشده است',
  text = 'با ثبت اولین عملیات، اطلاعات اینجا نمایش داده می‌شود.',
  icon: Icon = FileText,
  children,
}: {
  title?: string;
  text?: string;
  icon?: LucideIcon;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span>
        <Icon size={24} strokeWidth={1.5} />
      </span>
      <strong>{title}</strong>
      <p>{text}</p>
      {children}
    </div>
  );
}
export function GridTable({
  heads,
  rows,
  empty = 'هنوز اطلاعاتی ثبت نشده است',
  paginate = true,
}: {
  heads: string[];
  rows: ReactNode[][];
  empty?: string;
  paginate?: boolean;
}) {
  const [page, setPage] = useState(0);
  const pages = paginate ? Math.max(1, Math.ceil(rows.length / 25)) : 1,
    current = Math.min(page, pages - 1),
    shown = paginate ? rows.slice(current * 25, (current + 1) * 25) : rows;
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {heads.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i}>
                {r.map((v, j) => (
                  <td key={j}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty title={empty} />}
      </div>
      {pages > 1 && (
        <div className="table-pages">
          <small>
            صفحه {fa(current + 1)} از {fa(pages)} · {fa(rows.length)} ردیف
          </small>
          <button
            className="icon-btn"
            disabled={!current}
            aria-label="صفحه قبل"
            onClick={() => setPage(current - 1)}
          >
            <ChevronRight size={16} />
          </button>
          <button
            className="icon-btn"
            disabled={current === pages - 1}
            aria-label="صفحه بعد"
            onClick={() => setPage(current + 1)}
          >
            <ChevronLeft size={16} />
          </button>
        </div>
      )}
    </>
  );
}
export function Find({
  value,
  onChange,
  placeholder = 'جست‌وجو…',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="find">
      <Search size={17} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button className="icon-btn" aria-label="پاک کردن جست‌وجو" onClick={() => onChange('')}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}
export function Field({
  label,
  children,
  wide = false,
  hint,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
  hint?: string;
}) {
  const fid = useId();
  const control =
    isValidElement<Record<string, unknown>>(children) &&
    typeof children.type === 'string' &&
    !children.props['aria-label']
      ? cloneElement(children, {
          'aria-labelledby': fid,
          'aria-describedby': hint ? fid + '-hint' : undefined,
        })
      : children;
  return (
    <label className={'field' + (wide ? ' wide' : '')}>
      <span id={fid}>{label}</span>
      {control}
      {hint && <small id={fid + '-hint'}>{hint}</small>}
    </label>
  );
}
export function NumberField({
  label,
  name,
  value,
  onChange,
  required = false,
  hint,
}: {
  label: string;
  name?: string;
  value?: string;
  onChange?: (v: string) => void;
  required?: boolean;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        name={name}
        inputMode="numeric"
        placeholder="۰"
        required={required}
        autoComplete="off"
        {...(onChange
          ? { value, onChange: (e: any) => onChange(e.target.value) }
          : { defaultValue: value })}
      />
    </Field>
  );
}
export function DateField({
  name = 'date',
  label = 'تاریخ سند',
  value,
  onChange,
}: {
  name?: string;
  label?: string;
  value?: string;
  onChange?: (s: string) => void;
}) {
  const [s, setS] = useState(value || isoDate()),
    [show, setShow] = useState(false),
    [cursor, setCursor] = useState(new Date((value || s) + 'T12:00:00').valueOf());
  const root = useRef<HTMLDivElement>(null);
  const df = (t: number, o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('fa-IR', o).format(t);
  const day = (t: number) =>
    Number(new Intl.DateTimeFormat('en-u-ca-persian', { day: 'numeric' }).format(t));
  const a = new Date(cursor);
  a.setDate(a.getDate() - day(cursor) + 1);
  const first = +a,
    days: number[] = [];
  for (let i = 0; i < 32; i++) {
    const d = new Date(first);
    d.setDate(d.getDate() + i);
    if (i && day(+d) === 1) break;
    days.push(+d);
  }
  useEffect(() => {
    if (!show) return;
    const click = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setShow(false);
    };
    document.addEventListener('pointerdown', click);
    return () => document.removeEventListener('pointerdown', click);
  }, [show]);
  const change = (x: string) => {
    setS(x);
    onChange?.(x);
    setShow(false);
  };
  return (
    <div className="field date-field" ref={root}>
      <span>{label}</span>
      <input type="hidden" name={name} value={value || s} />
      <button type="button" className="select-date" onClick={() => setShow(!show)}>
        <CalendarDays size={16} />
        {dateFa(+new Date((value || s) + 'T12:00:00'))}
      </button>
      {show && (
        <div className="calendar">
          <div className="cal-head">
            <button type="button" aria-label="ماه قبل" onClick={() => setCursor(first - 86400000)}>
              <ChevronRight size={17} />
            </button>
            <b>{df(cursor, { month: 'long', year: 'numeric' })}</b>
            <button
              type="button"
              aria-label="ماه بعد"
              onClick={() => setCursor(days.at(-1)! + 86400000)}
            >
              <ChevronLeft size={17} />
            </button>
          </div>
          <div className="cal-grid">
            {['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((d, i) => (
              <small key={'w' + i}>{d}</small>
            ))}
            {Array.from({ length: (a.getDay() + 1) % 7 }, (_, i) => (
              <i key={'b' + i} />
            ))}
            {days.map((t) => (
              <button
                type="button"
                key={t}
                className={isoDate(t) === (value || s) ? 'selected' : ''}
                onClick={() => change(isoDate(t))}
              >
                {fa(day(t))}
              </button>
            ))}
          </div>
          <button type="button" className="text-link" onClick={() => change(isoDate())}>
            امروز
          </button>
        </div>
      )}
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  large = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  large?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    close = useRef(onClose),
    key = useId();
  close.current = () => {
    if (!ref.current?.querySelector('form[aria-busy=true]')) onClose();
  };
  useEffect(() => {
    const prev = document.activeElement as HTMLElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const root = ref.current;
    root?.focus();
    function handler(e: KeyboardEvent) {
      if ([...document.querySelectorAll('[role=dialog]')].at(-1) !== root) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current();
      }
      if (e.key === 'Tab') {
        const focusable = Array.from(
          root?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not([type=hidden]):not(:disabled),select,textarea,a[href]',
          ) || [],
        ).filter((el) => el.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0],
          last = focusable.at(-1);
        if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = overflow;
      prev?.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close.current();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={key}
        tabIndex={-1}
        className={'modal' + (large ? ' large' : '')}
      >
        <div className="modal-head">
          <div>
            <h2 id={key}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            type="button"
            aria-label="بستن"
            className="icon-btn"
            onClick={() => close.current()}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Form({
  children,
  submit,
  label = 'ذخیره اطلاعات',
  onDone,
  disabled = false,
}: {
  children: ReactNode;
  submit: (fd: FormData, key: string) => Promise<unknown>;
  label?: string;
  onDone?: (v: any) => void;
  disabled?: boolean;
}) {
  const { close, notice } = useDesk(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    lock = useRef(false),
    key = useRef(id());
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const v = await submit(new FormData(e.currentTarget), key.current);
      if (v !== false) {
        notice('اطلاعات با موفقیت روی دستگاه ذخیره شد.');
        close();
        onDone?.(v);
      }
    } catch (err) {
      setError(message(err));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} aria-busy={busy}>
      <div className="modal-body">
        {children}
        {error && (
          <div role="alert" className="alert error">
            {error}
          </div>
        )}
      </div>
      <div className="form-footer">
        <span className="local-note">
          <ShieldCheck size={14} /> ثبت روی دستگاه
        </span>
        <button type="button" className="btn secondary" disabled={busy} onClick={close}>
          انصراف
        </button>
        <button className="btn primary" disabled={busy || disabled}>
          {busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} {label}
        </button>
      </div>
    </form>
  );
}
export const message = (e: unknown) =>
  e instanceof Error
    ? e.name === 'QuotaExceededError'
      ? 'فضای دستگاه کافی نیست؛ نسخه پشتیبان بگیرید.'
      : /^[\x00-\x7F]+$/.test(e.message)
        ? 'عملیات کامل نشد. فضای ذخیره‌سازی و اطلاعات واردشده را بررسی کنید.'
        : e.message
    : 'عملیات انجام نشد.';
