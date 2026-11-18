import { db, parties } from './db';
import { atomic, line, post } from './ledger';
import { check, id, integer, type Party, type Product, type Role } from './model';
export async function saveParty(
  role: Role,
  fields: Partial<Party> & { name: string },
  opening = 0,
  key = id(),
) {
  const partyId = fields.id || key;
  return atomic(
    key,
    role,
    fields.name,
    async () => {
      const old = await parties(role).get(partyId);
      check(fields.name.trim(), 'نام را وارد کنید.');
      const p: Party = {
        phone: '',
        address: '',
        delivery: '',
        location: '',
        instructions: '',
        time: '',
        notes: '',
        ...old,
        ...fields,
        name: fields.name.trim(),
        createdAt: old?.createdAt || Date.now(),
        id: partyId,
      };
      await parties(role).put(p);
      if (!old && opening) {
        integer(opening, Number.MIN_SAFE_INTEGER);
        const d = role === 'customer' ? opening : -opening;
        await post(partyId, Date.now(), 'opening', 'مانده اول دوره ' + p.name, [
          line(role === 'customer' ? 'ar' : 'ap', Math.max(0, d), Math.max(0, -d), partyId),
          line('equity', Math.max(0, -d), Math.max(0, d)),
        ]);
      }
      return partyId;
    },
    partyId,
  );
}
export async function saveProduct(p: Product, key = id()) {
  check(p.name.trim() && p.weight.trim(), 'نام و محدوده وزنی لازم است.');
  integer(p.salePrice);
  return atomic(key, 'product', p.name, () => db.products.put(p), p.id);
}
export async function addBank(name: string, key = id()) {
  check(name.trim(), 'نام بانک ضروری است.');
  return atomic(key, 'wallet', name, () => db.bankAccounts.add({ id: key, name: name.trim() }));
}
