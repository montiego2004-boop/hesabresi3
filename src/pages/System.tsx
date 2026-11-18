import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArchiveRestore,
  DatabaseBackup,
  Download,
  FileKey2,
  FolderDown,
  HardDrive,
  Info,
  LockKeyhole,
  Save,
  Share2,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  exportBackup,
  importBackup,
  loadSnapshot,
  pinHash,
  prepareRestore,
  restore,
  snapshot,
  type Payload,
} from '../core/backup';
import { db } from '../core/db';
import { atomic, readMedia } from '../core/engine';
import { download, saveFile, shareFile } from '../core/files';
import { check, dateFa, fa, id, isoDate, labels } from '../core/model';
import { Field, GridTable, Heading, SectionHead, message } from '../ui/common';
import { useDesk } from '../ui/context';
export function Backups() {
  const { book: b, confirm, notice } = useDesk(),
    [password, sp] = useState(''),
    [pw, si] = useState(''),
    [file, sf] = useState<File | null>(null),
    [busy, lock] = useState(false),
    [err, se] = useState(''),
    [ready, setReady] = useState<{ blob: Blob; count: number; name: string } | null>(null),
    [candidate, sc] = useState<Payload | null>(null);
  const snaps =
    useLiveQuery(
      async () =>
        (await db.snapshots.orderBy('date').reverse().toArray()).map((s) => ({
          id: s.id,
          date: s.date,
          kind: s.kind,
        })),
      [],
    ) || [];
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    lock(true);
    se('');
    try {
      await fn();
    } catch (e) {
      se(message(e));
    } finally {
      lock(false);
    }
  };
  const commitRestore = async (p: Payload) => {
    const safety = await prepareRestore(p);
    if (
      !(await confirm(
        `اطلاعات فعلی با نسخه ${dateFa(p.date)} شامل ${fa(p.tables.salesInvoices.length + p.tables.purchaseInvoices.length)} فاکتور جایگزین شود؟ نسخه ایمنی دفتر فعلی ذخیره شد.`,
        true,
      ))
    )
      return;
    await restore(p, true, safety);
    sc(null);
    si('');
    setReady(null);
    notice('بازیابی و کنترل یکپارچگی با موفقیت انجام شد.');
  };
  return (
    <>
      <Heading
        title="پشتیبان‌گیری و بازیابی"
        sub="یک نسخه مستقل از دفتر مالی خود را خارج از مرورگر نگه دارید."
      />
      <div className="privacy-banner">
        <span className="icon-box jade">
          <ShieldCheck size={24} />
        </span>
        <div>
          <h2>اطلاعات شما، روی دستگاه شما</h2>
          <p>
            نسخه کامل شامل فاکتورها، نشانی‌ها، اسناد حسابداری، امضاها و پیوست‌هاست. هیچ فایلی به
            سرور ارسال نمی‌شود.
          </p>
        </div>
      </div>
      {err && (
        <div className="alert error" role="alert">
          {err}
        </div>
      )}
      <div className="two-cols">
        <section className="card">
          <SectionHead
            title="ساخت نسخه پشتیبان"
            sub="خروجی قابل انتقال با رمزنگاری احرازشده"
            icon={FileKey2}
          />
          <form
            className="panel-form"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const v = await exportBackup(password);
                setReady({
                  blob: new Blob([v.text], { type: 'application/octet-stream' }),
                  count: v.count,
                  name: 'daneh-' + isoDate() + '.daneh',
                });
                sp('');
              });
            }}
          >
            <Field label="رمز فایل پشتیبان" hint="حداقل ۸ نویسه؛ فراموش کردن رمز قابل جبران نیست.">
              <input
                value={password}
                onChange={(e) => {
                  sp(e.target.value);
                  setReady(null);
                }}
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </Field>
            <button className="btn primary" disabled={busy}>
              <LockKeyhole size={15} />
              {busy ? 'در حال پردازش…' : 'ساخت فایل رمزنگاری‌شده'}
            </button>
          </form>
          {ready && (
            <div className="ready-box">
              <b>فایل آماده ذخیره است · {fa(ready.count)} رکورد</b>
              <div className="actions">
                <button
                  className="btn primary small-btn"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      if (await saveFile(ready.blob, ready.name, true)) {
                        await db.backupHistory.add({
                          id: id(),
                          date: Date.now(),
                          kind: 'manual',
                          count: ready.count,
                        });
                        notice('فایل برای ذخیره به دستگاه تحویل داده شد.');
                      }
                    })
                  }
                >
                  <FolderDown size={15} />
                  ذخیره روی دستگاه
                </button>
                <button
                  className="btn secondary small-btn"
                  onClick={() => run(() => shareFile(ready.blob, ready.name))}
                >
                  <Share2 size={15} />
                  اشتراک فایل
                </button>
              </div>
            </div>
          )}
        </section>
        <section className="card">
          <SectionHead
            title="بازیابی نسخه موجود"
            sub="رمز، ساختار و تراز حساب‌ها پیش از جایگزینی بررسی می‌شوند."
            icon={ArchiveRestore}
          />
          <form
            className="panel-form"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                check(file && file.size < 256 * 1024 * 1024, 'فایل پشتیبان معتبر انتخاب کنید.');
                sc(await importBackup(await file.text(), pw));
              });
            }}
          >
            <Field label="فایل پشتیبان">
              <input
                type="file"
                required
                accept=".daneh,.json,application/octet-stream,application/json"
                onChange={(e) => {
                  sf(e.target.files?.[0] || null);
                  sc(null);
                }}
              />
            </Field>
            <Field label="رمز فایل">
              <input
                required
                type="password"
                value={pw}
                onChange={(e) => {
                  si(e.target.value);
                  sc(null);
                }}
              />
            </Field>
            <button className="btn secondary" disabled={busy}>
              <ShieldCheck size={15} />
              بررسی نسخه
            </button>
          </form>
          {candidate && (
            <div className="ready-box">
              <b>نسخه معتبر است · {dateFa(candidate.date)}</b>
              <span>
                {fa(candidate.tables.customers.length)} مشتری ·{' '}
                {fa(candidate.tables.salesInvoices.length)} فاکتور فروش
              </span>
              <button
                className="btn danger"
                disabled={busy}
                onClick={() => run(() => commitRestore(candidate))}
              >
                تأیید بازیابی نسخه بررسی‌شده
              </button>
            </div>
          )}
        </section>
      </div>
      <section className="card">
        <SectionHead
          title="تصویرهای محلی"
          sub={
            'نگهداری ' +
            fa(b.settings.retention) +
            ' تصویر خودکار اخیر؛ نسخه‌های ایمنی بازیابی جدا هستند.'
          }
        >
          <button
            className="btn secondary small-btn"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await snapshot();
                notice('تصویر محلی به‌روز است.');
              })
            }
          >
            <DatabaseBackup size={15} />
            ثبت تصویر محلی
          </button>
        </SectionHead>
        <p className="info-line">
          <Info size={16} />
          تصویرهای محلی با پاک شدن داده‌های مرورگر از دست می‌روند. اجرای خودکار هنگام بسته بودن کامل
          برنامه تضمین نمی‌شود.
        </p>
        <GridTable
          heads={['تاریخ', 'نوع نسخه', 'بازیابی']}
          rows={snaps.map((s) => [
            dateFa(s.date),
            labels[s.kind],
            <button
              className="text-link"
              disabled={busy}
              onClick={() => run(async () => commitRestore(await loadSnapshot(s.id)))}
            >
              بررسی و بازیابی
            </button>,
          ])}
        />
      </section>
      <section className="card">
        <SectionHead title="تاریخچه پشتیبان‌گیری" />
        <GridTable
          heads={['تاریخ', 'عملیات', 'تعداد رکورد']}
          rows={b.history.slice(0, 100).map((h) => [dateFa(h.date), labels[h.kind], fa(h.count)])}
        />
      </section>
      <details className="card help">
        <summary>راهنمای انتقال به گوشی دیگر</summary>
        <ol>
          <li>روی گوشی فعلی نسخه رمزنگاری‌شده بسازید و فایل را در پوشه‌ای مستقل ذخیره کنید.</li>
          <li>فایل را به گوشی مقصد منتقل کنید. رمز را جدا از فایل نگه دارید.</li>
          <li>در گوشی مقصد برنامه را از همان نشانی امن باز و نصب کنید.</li>
          <li>
            فایل را انتخاب کنید، رمز را وارد و مشخصات نسخه را بررسی کنید؛ تنها پس از تأیید شما
            بازیابی انجام می‌شود.
          </li>
        </ol>
      </details>
    </>
  );
}
export function Settings() {
  const { book: b, notice, confirm, offlineReady, open } = useDesk(),
    s = b.settings,
    [estimate, est] = useState<StorageEstimate>({}),
    [persistent, ps] = useState<boolean | null>(null),
    [error, se] = useState(''),
    [busy, setBusy] = useState(false);
  const refresh = async () => {
    try {
      if (navigator.storage?.estimate) est(await navigator.storage.estimate());
      ps(navigator.storage?.persisted ? await navigator.storage.persisted() : null);
    } catch {
      ps(null);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const persist = async () => {
    try {
      if (!navigator.storage?.persist) {
        notice('مرورگر درخواست ماندگاری را پشتیبانی نمی‌کند.');
        return;
      }
      const ok = await navigator.storage.persist();
      await refresh();
      notice(
        ok
          ? 'ماندگاری توسط مرورگر تأیید شد.'
          : 'مرورگر فعلاً ماندگاری را نپذیرفت. پشتیبان دستی بگیرید.',
      );
    } catch (e) {
      notice(message(e));
    }
  };
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!(await confirm('تنظیمات مجموعه روی این دستگاه ذخیره شود؟', true))) return;
    setBusy(true);
    se('');
    try {
      const logo = f.get('logo') as File,
        pin = String(f.get('pin') || ''),
        retention = Number(f.get('retention'));
      check(String(f.get('business') || '').trim(), 'نام کسب‌وکار ضروری است.');
      check(!pin || /^\d{4,12}$/.test(pin), 'رمز مدیریت باید ۴ تا ۱۲ رقم انگلیسی باشد.');
      check(
        Number.isInteger(retention) && retention >= 1 && retention <= 30,
        'تعداد نسخه بین ۱ و ۳۰ است.',
      );
      const newLogo = logo?.size ? (await readMedia(logo, true)).data : s.logo,
        newPin = pin ? await pinHash(pin) : f.get('removePin') ? '' : s.pin;
      await atomic(id(), 'settings', 'تغییر تنظیمات مجموعه', () =>
        db.appSettings.put({
          ...s,
          business: String(f.get('business')).trim(),
          logo: newLogo,
          retention,
          pin: newPin,
        }),
      );
      notice('تنظیمات ذخیره شد.');
    } catch (e) {
      se(message(e));
    } finally {
      setBusy(false);
    }
  };
  const free = (estimate.quota || 0) - (estimate.usage || 0),
    low = estimate.quota !== undefined && free < 50 * 1024 * 1024;
  let hasLegacy = false;
  try {
    hasLegacy =
      !!localStorage.getItem('hesab_customers_v8') ||
      !!localStorage.getItem('hesab_egg_inventory_v2');
  } catch {
    /* Storage disabled; never write to legacy storage. */
  }
  return (
    <>
      <Heading title="تنظیمات برنامه" sub="مشخصات کسب‌وکار، امنیت محلی و وضعیت ذخیره‌سازی" />
      <div className="two-cols settings-grid">
        <section className="card">
          <SectionHead title="مشخصات مجموعه" sub="برای فاکتورهای جدید استفاده می‌شود." />
          <form className="panel-form" onSubmit={submit}>
            <Field label="نام کسب‌وکار">
              <input required name="business" defaultValue={s.business} maxLength={120} />
            </Field>
            <Field label="نشان مجموعه (اختیاری)">
              <input type="file" name="logo" accept="image/png,image/jpeg" />
            </Field>
            {s.logo && <img className="business-logo" src={s.logo} alt="نشان مجموعه" />}
            <Field label="تعداد تصویرهای خودکار قابل نگهداری">
              <input
                type="number"
                min="1"
                max="30"
                name="retention"
                defaultValue={s.retention}
                required
              />
            </Field>
            <Field
              label={s.pin ? 'تغییر رمز مدیریت' : 'رمز مدیریت اختیاری'}
              hint="برای اصلاح موجودی، برگشت، بازیابی و تنظیمات. قفل رابط کاربری است، نه رمزنگاری کل دستگاه."
            >
              <input
                name="pin"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                placeholder="۴ تا ۱۲ رقم انگلیسی"
              />
            </Field>
            {s.pin && (
              <label className="check">
                <input name="removePin" type="checkbox" />
                حذف رمز مدیریت فعلی
              </label>
            )}
            {error && <div className="alert error">{error}</div>}
            <button className="btn primary" disabled={busy}>
              <Save size={16} />
              ذخیره تنظیمات
            </button>
          </form>
        </section>
        <div className="stack">
          <section className="card">
            <SectionHead title="فضای ذخیره‌سازی" icon={HardDrive} />
            <div className="panel-form">
              <div className="key-value">
                <span>حجم مصرف‌شده</span>
                <b>
                  {estimate.usage === undefined
                    ? 'نامشخص'
                    : fa(Math.ceil(estimate.usage / 1024)) + ' کیلوبایت'}
                </b>
              </div>
              <div className="key-value">
                <span>سهمیه در دسترس مرورگر</span>
                <b>
                  {estimate.quota === undefined
                    ? 'نامشخص'
                    : fa(Math.round(estimate.quota / 1048576)) + ' مگابایت'}
                </b>
              </div>
              <div className={'alert ' + (persistent ? 'success' : 'warning')}>
                {persistent
                  ? 'مرورگر ماندگاری فضای ذخیره‌سازی را تأیید کرده است.'
                  : persistent === null
                    ? 'وضعیت ماندگاری در این مرورگر در دسترس نیست.'
                    : 'ماندگاری فضای ذخیره‌سازی تأیید نشده است. نسخه دستی بگیرید.'}
              </div>
              {low && (
                <div className="alert error">فضای باقی‌مانده کم است؛ اکنون پشتیبان بگیرید.</div>
              )}
              <button className="btn secondary" onClick={persist}>
                <ShieldCheck size={15} />
                درخواست فضای ماندگار
              </button>
              <Link className="text-link" to="/backup">
                ذخیره نسخه پشتیبان مستقل
              </Link>
            </div>
          </section>
          <section className="card">
            <SectionHead title="نصب و دسترسی آفلاین" icon={Smartphone} />
            <div className="panel-form">
              <span className={'tag ' + (offlineReady ? 'jade' : 'amber')}>
                {offlineReady ? 'آماده استفاده آفلاین' : 'پوسته آفلاین هنوز تأیید نشده است'}
              </span>
              <p className="muted">
                پس از نصب اولیه و ذخیره کامل برنامه، فاکتورها، گزارش‌ها و فایل‌های خروجی به اینترنت
                وابسته نیستند.
              </p>
              <button className="btn secondary" onClick={() => open('install')}>
                <Download size={15} />
                راهنمای نصب در اندروید
              </button>
            </div>
          </section>
        </div>
      </div>
      <section className="card help">
        <h2>راهنمای کار با دانه‌حساب</h2>
        {[
          [
            'شروع کار',
            'مشخصات مجموعه را تکمیل کنید، مشتریان و تأمین‌کنندگان را ثبت کنید و مانده افتتاحیه صندوق و بانک را وارد کنید.',
          ],
          [
            'خرید و انبار',
            'ثبت فاکتور خرید، بچ کالا و بدهی تأمین‌کننده می‌سازد. برای شمارش واقعی یا ضایعات از «شمارش و اصلاح» استفاده کنید، نه خرید.',
          ],
          [
            'فروش و تسویه',
            'پس از ورود کالا، فاکتور چندردیفی بسازید. تخفیف، هزینه، امضا و تسویه را ثبت کنید. وجه اضافه به اعتبار مشتری تبدیل می‌شود. برای اصلاح سند، برگشت یا ابطال ثبت کنید و در صورت نیاز فاکتور جدید بسازید.',
          ],
          [
            'دفاتر و گزارش‌ها',
            'همه مبالغ به تومان صحیح و تاریخ‌ها شمسی‌اند. بهای فروش از قدیمی‌ترین بچ‌ها محاسبه می‌شود. در گزارش‌ها بازه زمانی را انتخاب و خروجی پی‌دی‌اف یا CSV بگیرید.',
          ],
          [
            'حریم خصوصی و نگهداری',
            'اطلاعات مالی به سرور فرستاده نمی‌شوند. پاک کردن داده سایت، حذف پروفایل مرورگر یا سیاست سیستم‌عامل ممکن است داده را پاک کند. نسخه دستی رمزنگاری‌شده و رمز آن را در محل‌های جدا نگه دارید.',
          ],
        ].map(([k, v]) => (
          <details key={k}>
            <summary>{k}</summary>
            <p>{v}</p>
          </details>
        ))}
      </section>
      {hasLegacy && (
        <section className="card padded">
          <h2>اطلاعات نسخه قدیمی</h2>
          <p>
            داده‌های قدیمی تغییر نکرده‌اند. برای جلوگیری از ایجاد مانده‌های غیرواقعی خودکار وارد
            دفتر دوطرفه نمی‌شوند. یک رونوشت نگه دارید و مانده‌های تأییدشده را افتتاحیه بزنید.
          </p>
          <button
            className="btn secondary"
            onClick={() => {
              const records = Object.fromEntries(
                ['hesab_customers_v7', 'hesab_customers_v8', 'hesab_egg_inventory_v2'].map((k) => [
                  k,
                  localStorage.getItem(k),
                ]),
              );
              download(
                new Blob([JSON.stringify(records)], { type: 'application/json' }),
                'legacy-local.json',
              );
            }}
          >
            ذخیره رونوشت قدیمی (بدون رمز)
          </button>
        </section>
      )}
    </>
  );
}
