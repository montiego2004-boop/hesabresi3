import { createContext, useContext } from 'react';
import type { Book } from '../core/reports';
export type DialogKind =
  | 'customer'
  | 'supplier'
  | 'sale'
  | 'purchase'
  | 'payment'
  | 'cash'
  | 'adjust'
  | 'product'
  | 'bank'
  | 'return'
  | 'allocate'
  | 'search'
  | 'install'
  | 'reverseMoney';
export type Dialog = { kind: DialogKind; arg?: string; extra?: string };
export type Desk = {
  book: Book;
  open: (kind: DialogKind, arg?: string, extra?: string) => void;
  close: () => void;
  notice: (message: string) => void;
  confirm: (message: string, sensitive?: boolean) => Promise<boolean>;
  offlineReady: boolean;
};
export const DeskContext = createContext<Desk | null>(null);
export function useDesk() {
  const v = useContext(DeskContext);
  if (!v) throw new Error('پایگاه داده در دسترس نیست.');
  return v;
}
