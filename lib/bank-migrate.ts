// One-off (go-public B5): encrypt bank numbers that are still plain text, in place. Safe to run again.
import { needsSealing, readBank, sealBank } from "@/lib/bank-fields";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export async function sealPlainBankRows(db: Db) {
  const rows = (await db.employee.findMany({
    select: { id: true, depositRouting: true, depositAccount: true },
  })) as { id: string; depositRouting: string; depositAccount: string }[];
  let sealed = 0;
  for (const row of rows) {
    if (!needsSealing(row)) continue;
    const plain = readBank(row);
    await db.employee.update({ where: { id: row.id }, data: sealBank(row.id, plain) });
    sealed += 1;
  }
  return { checked: rows.length, sealed };
}
