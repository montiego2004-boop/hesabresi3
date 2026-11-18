import { useLiveQuery } from 'dexie-react-hooks';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronsUpDown,
  Download,
  Info,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Package,
  PanelRightClose,
  Plus,
  Search,
  ShieldCheck,
  Smartphone,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { pinHash, scheduleSnapshots } from './core/backup';
import { dateFa } from './core/model';
import { readBook } from './core/reports';
import { Dashboard } from './pages/Dashboard';
import { CashPage, Ledger, Reports } from './pages/Finance';
import {
  Directory,
  DocsList,
  Inventory,
  InvoicePage,
  NotFound,
  PartyProfile,
  ProductPage,
} from './pages/Records';
import { Backups, Settings } from './pages/System';
import { BrandMark, Field, Modal } from './ui/common';
import { DeskContext, type Dialog, type DialogKind } from './ui/context';
import { Dialogs } from './ui/dialogs';
import { navGroups } from './ui/nav';
import { registerPWA } from './ui/pwa';
type Confirmation = { text: string; sensitive: boolean; resolve: (v: boolean) => void };
function Shell() {
  const book = useLiveQuery(readBook, []),
    loc = useLocation(),
    go = useNavigate(),
    [d, setD] = useState<Dialog | null>(null),
    [ask, setAsk] = useState<Confirmation | null>(null),
    [toast, st] = useState(''),
    [menu, sm] = useState(false),
    [offlineReady, setOffline] = useState(false),
    [online, son] = useState(navigator.onLine),
    [update, su] = useState<ServiceWorkerRegistration | null>(null),
    [pin, sp] = useState(''),
    [pinError, spe] = useState(''),
    [collapsed, sc] = useState(false),
    [narrow, setNarrow] = useState(matchMedia('(max-width:1050px)').matches);
  useEffect(() => {
    const media = matchMedia('(max-width:1050px)');
    const change = () => setNarrow(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    confirmLock = useRef(false);
  const notice = (t: string) => {
    st(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => st(''), 5200);
  };
  const open = (kind: DialogKind, arg?: string, extra?: string) => {
    sm(false);
    setD({ kind, arg, extra });
  };
  const close = () => setD(null);
  const confirm = (text: string, sensitive = false) =>
    new Promise<boolean>((resolve) => {
      sp('');
      spe('');
      setAsk({ text, sensitive, resolve });
    });
  const answer = async (v: boolean) => {
    if (confirmLock.current || !ask) return;
    confirmLock.current = true;
    try {
      if (
        v &&
        ask.sensitive &&
        book?.settings.pin &&
        (await pinHash(pin, book.settings.pin.split('.')[0])) !== book.settings.pin
      ) {
        spe('رمز مدیریت صحیح نیست.');
        return;
      }
      ask.resolve(v);
      setAsk(null);
      sp('');
    } finally {
      confirmLock.current = false;
    }
  };
  useEffect(() => {
    const stop = scheduleSnapshots(() =>
      notice('ساخت تصویر محلی کامل نشد. فضای دستگاه را بررسی و پشتیبان دستی بگیرید.'),
    );
    registerPWA(setOffline, su).catch(() =>
      notice('ذخیره پوسته آفلاین کامل نشد. با اتصال پایدار دوباره باز کنید.'),
    );
    const net = () => son(navigator.onLine);
    window.addEventListener('online', net);
    window.addEventListener('offline', net);
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        open('search');
      }
      if (e.key === 'Escape') sm(false);
    };
    window.addEventListener('keydown', key);
    return () => {
      stop();
      window.removeEventListener('online', net);
      window.removeEventListener('offline', net);
      window.removeEventListener('keydown', key);
    };
  }, []);
  useEffect(() => {
    sm(false);
    window.scrollTo(0, 0);
    const n = navGroups
      .flatMap((g) => g.items)
      .find((i) => i.path === '/' + (loc.pathname.split('/')[1] || ''));
    document.title = (n?.name || 'صفحه') + ' | دانه‌حساب';
  }, [loc.pathname]);
  if (!book) return <Loading />;
  const current = navGroups
    .flatMap((g) => g.items)
    .find((n) => n.path === '/' + (loc.pathname.split('/')[1] || ''));
  return (
    <DeskContext.Provider value={{ book, open, close, notice, confirm, offlineReady }}>
      <div className={'app-shell' + (collapsed ? ' compact-nav' : '')}>
        {menu && <button aria-label="بستن منو" className="nav-scrim" onClick={() => sm(false)} />}
        <aside inert={narrow && !menu} className={'sidebar' + (menu ? ' opened' : '')}>
          <Link to="/" className="brand" onClick={() => sm(false)}>
            <span className="logo-tile">
              <BrandMark />
            </span>
            <div>
              <strong>دانه‌حساب</strong>
              <small>مدیریت پخش تخم‌مرغ</small>
            </div>
          </Link>
          <div className="nav-scroller">
            <nav>
              {navGroups.map((g) => (
                <div className="nav-group" key={g.title}>
                  <span className="nav-label">{g.title}</span>
                  {g.items.map((n) => (
                    <NavLink
                      key={n.path}
                      to={n.path}
                      end={n.path === '/'}
                      title={n.name}
                      className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
                    >
                      <n.icon size={18} strokeWidth={1.65} />
                      <span>{n.name}</span>
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>
          </div>
          <div className="sidebar-bottom">
            <button className="install-side" onClick={() => open('install')}>
              <Smartphone size={17} />
              <span>نصب روی گوشی</span>
              <Download size={14} />
            </button>
            <button className="profile" onClick={() => go('/settings')}>
              <span className="profile-avatar">
                <UserRound size={20} />
              </span>
              <span>
                <b>مدیر مجموعه</b>
                <small>حساب محلی</small>
              </span>
              <ChevronsUpDown size={14} />
            </button>
          </div>
        </aside>
        <div className="work-area">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-btn desktop-only"
                aria-label="تغییر اندازه منو"
                onClick={() => sc(!collapsed)}
              >
                <PanelRightClose size={18} />
              </button>
              <button
                className="icon-btn mobile-only"
                aria-label="باز کردن منو"
                onClick={() => sm(true)}
              >
                <Menu size={21} />
              </button>
              <span className="crumb-base">فضای کاری</span>
              <ChevronLeft size={13} />
              <b>{current?.name || 'دفتر محلی'}</b>
            </div>
            <div className="top-tools">
              <span className="date-stamp">
                <CalendarDays size={15} />
                {dateFa(Date.now(), true)}
              </span>
              <i className="vline" />
              <button
                className="local-badge"
                title="وضعیت ذخیره‌سازی"
                onClick={() => go('/settings')}
              >
                <i />
                {online ? 'ذخیره‌سازی محلی' : 'کار در حالت آفلاین'}
              </button>
              <button
                className="top-search"
                aria-label="جست‌وجو در برنامه"
                onClick={() => open('search')}
              >
                <Search size={18} />
              </button>
            </div>
          </header>
          <main className="main">
            {update && (
              <div className="alert info inline-between">
                نسخه جدید آماده است. پس از پایان کار به‌روزرسانی کنید.
                <button
                  className="btn secondary small-btn"
                  onClick={async () => {
                    if (
                      await confirm(
                        'برنامه برای دریافت نسخه جدید بازخوانی شود؟ اطلاعات ثبت‌شده حفظ می‌شود.',
                      )
                    ) {
                      navigator.serviceWorker.addEventListener(
                        'controllerchange',
                        () => location.reload(),
                        { once: true },
                      );
                      update.waiting?.postMessage('ACTIVATE_UPDATE');
                    }
                  }}
                >
                  به‌روزرسانی
                </button>
              </div>
            )}
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/customers" element={<Directory key="customers" role="customer" />} />
              <Route path="/customers/:id" element={<PartyProfile role="customer" />} />
              <Route path="/suppliers" element={<Directory key="suppliers" role="supplier" />} />
              <Route path="/suppliers/:id" element={<PartyProfile role="supplier" />} />
              <Route path="/sales" element={<DocsList key="sales" side="sale" />} />
              <Route path="/purchases" element={<DocsList key="buys" side="purchase" />} />
              <Route path="/sales/:id" element={<InvoicePage side="sale" />} />
              <Route path="/purchases/:id" element={<InvoicePage side="purchase" />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/inventory/:id" element={<ProductPage />} />
              <Route path="/cash" element={<CashPage />} />
              <Route path="/ledger" element={<Ledger />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/backup" element={<Backups />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <footer className="main-footer">
              <span>
                دانه‌حساب <i /> دفتر مدیریت پخش
              </span>
              <span>
                <ShieldCheck size={13} /> اطلاعات روی این دستگاه نگهداری می‌شود
              </span>
            </footer>
          </main>
        </div>
      </div>
      <nav className="mobile-tabs" aria-label="ناوبری سریع">
        <NavLink to="/" end>
          <LayoutDashboard size={19} />
          <span>داشبورد</span>
        </NavLink>
        <NavLink to="/inventory">
          <Package size={19} />
          <span>انبار</span>
        </NavLink>
        <button className="mobile-create" onClick={() => open('sale')}>
          <i>
            <Plus size={20} />
          </i>
          <span>فروش جدید</span>
        </button>
        <NavLink to="/cash">
          <Wallet size={19} />
          <span>صندوق</span>
        </NavLink>
        <button onClick={() => sm(!menu)}>
          <Menu size={19} />
          <span>بیشتر</span>
        </button>
      </nav>
      {d && <Dialogs key={d.kind + ':' + (d.arg || '') + ':' + (d.extra || '')} dialog={d} />}
      {ask && (
        <Modal title="تأیید عملیات" onClose={() => answer(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void answer(true);
            }}
          >
            <div className="modal-body">
              <div className="confirm-mark">
                <ShieldCheck size={24} />
              </div>
              <p>{ask.text}</p>
              {ask.sensitive && book.settings.pin && (
                <Field label="رمز مدیریت">
                  <input
                    required
                    type="password"
                    value={pin}
                    onChange={(e) => sp(e.target.value)}
                  />
                </Field>
              )}
              {pinError && <p className="red-text">{pinError}</p>}
            </div>
            <div className="form-footer">
              <button className="btn secondary" type="button" onClick={() => answer(false)}>
                انصراف
              </button>
              <button className="btn primary">
                <Check size={15} />
                تأیید و ادامه
              </button>
            </div>
          </form>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Info size={17} />
          <span>{toast}</span>
          <button className="icon-btn" aria-label="بستن پیام" onClick={() => st('')}>
            <X size={14} />
          </button>
        </div>
      )}
    </DeskContext.Provider>
  );
}
export function Loading() {
  return (
    <div className="loading">
      <img src="/icons/brand.svg" alt="" />
      <b>دانه‌حساب</b>
      <span>
        <LoaderCircle size={15} className="spin" />
        در حال باز کردن دفتر محلی…
      </span>
    </div>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
