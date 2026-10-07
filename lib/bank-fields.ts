// Server only. Employee bank numbers: encrypt on save, decrypt only on the server, show only last 4.
import { bankContext, decryptField, encryptField, isEncryptedField, last4 } from "@/lib/field-crypto";

type BankRow = { id: string; depositRouting?: string | null; depositAccount?: string | null };

export function readBank(row: BankRow) {
  const routing = decryptField(row.depositRouting, bankContext(row.id, "depositRouting"));
  const account = decryptField(row.depositAccount, bankContext(row.id, "depositAccount"));
  return { routing, account };
}

/** What the phone gets: last 4 only, never the full numbers. */
export function bankForScreen(row: BankRow) {
  const { routing, account } = readBank(row);
  return { depositRoutingLast4: last4(routing), depositAccountLast4: last4(account) };
}

export function sealBank(employeeId: string, plain: { routing: string; account: string }) {
  return {
    depositRouting: encryptField(plain.routing, bankContext(employeeId, "depositRouting")),
    depositAccount: encryptField(plain.account, bankContext(employeeId, "depositAccount")),
  };
}

/** Rows that still hold plain bank numbers (for the one-off migration). */
export function needsSealing(row: BankRow) {
  return (Boolean(row.depositRouting) && !isEncryptedField(row.depositRouting)) || (Boolean(row.depositAccount) && !isEncryptedField(row.depositAccount));
}
