import {
  BookOpenText,
  Boxes,
  ChartNoAxesCombined,
  DatabaseBackup,
  LayoutDashboard,
  ReceiptText,
  Settings2,
  ShoppingBasket,
  Truck,
  UsersRound,
  Wallet,
} from 'lucide-react';
export const navGroups = [
  {
    title: 'فضای کاری',
    items: [
      { name: 'داشبورد', path: '/', icon: LayoutDashboard },
      { name: 'فروش و فاکتورها', path: '/sales', icon: ReceiptText },
      { name: 'خریدها', path: '/purchases', icon: ShoppingBasket },
      { name: 'مدیریت انبار', path: '/inventory', icon: Boxes },
    ],
  },
  {
    title: 'طرف‌های حساب',
    items: [
      { name: 'مشتریان', path: '/customers', icon: UsersRound },
      { name: 'تأمین‌کنندگان', path: '/suppliers', icon: Truck },
    ],
  },
  {
    title: 'مدیریت مالی',
    items: [
      { name: 'صندوق و بانک', path: '/cash', icon: Wallet },
      { name: 'دفتر حسابداری', path: '/ledger', icon: BookOpenText },
      { name: 'گزارش‌ها', path: '/reports', icon: ChartNoAxesCombined },
    ],
  },
  {
    title: 'سیستم',
    items: [
      { name: 'پشتیبان‌گیری', path: '/backup', icon: DatabaseBackup },
      { name: 'تنظیمات', path: '/settings', icon: Settings2 },
    ],
  },
];
