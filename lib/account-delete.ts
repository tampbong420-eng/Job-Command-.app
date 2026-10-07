// Server code (fs). Imported only by app/account-actions.ts. No "server-only" marker so the DB-copy test can run it.
import { readdir, rm, unlink } from "fs/promises";
import path from "path";
import {
  REMOVED_PIN_HASH,
  SHOP_WIPE_ORDER,
  billingNoteAfterDelete,
  liveSubscription,
  uploadRelPath,
  type BillingForDelete,
} from "@/lib/account-delete-core";
import { deleteUpload, isBlobUrl } from "@/lib/upload-store";

/* Any Prisma client (the live one, or a test client on a DB copy). Model delegates are looked up by name
   so a model another worker adds later does not break the build; the wipe test flags it instead. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export function defaultUploadsRoot() {
  return path.join(process.cwd(), "public", "uploads");
}

/** Empty the shop's uploads folder (job photos, receipts, logo, crew photos). Keeps the folder itself. */
async function clearUploads(root: string) {
  let removed = 0;
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    await rm(path.join(root, entry.name), { recursive: true, force: true }).catch(() => undefined);
    removed += 1;
  }
  return removed;
}

/**
 * Delete the whole shop: every record, every login, every uploaded file. The app opens to a fresh sign-up.
 * Never calls Stripe (see STRIPE_CANCEL_ON_DELETE). If a paid plan is still on, one billing note with the
 * Stripe ids is written after the wipe so the plan can still be found and cancelled.
 */
export async function wipeShop(db: Db, options: { uploadsRoot?: string; now?: Date } = {}) {
  const now = options.now || new Date();
  const billing = (await db.appSettings.findUnique({ where: { id: "default" } }).catch(() => null)) as
    | BillingForDelete
    | null;
  // Multi-shop: only THIS shop's Blob files (db is shop-scoped). Never list/delete the whole Blob store,
  // or deleting one shop would wipe every other shop's photos.
  const blobUrls = options.uploadsRoot ? [] : await shopBlobUrls(db, billing);
  const counts: Record<string, number> = {};
  await db.$transaction(async (tx: Db) => {
    for (const model of SHOP_WIPE_ORDER) {
      const delegate = tx[model];
      if (!delegate?.deleteMany) continue;
      const result = await delegate.deleteMany({});
      counts[model] = result?.count ?? 0;
    }
  });
  const note = billingNoteAfterDelete(billing, now);
  if (note) await db.auditLog.create({ data: note });
  const files =
    (await clearUploads(options.uploadsRoot || defaultUploadsRoot())) +
    (await deleteBlobUrls(blobUrls));
  return { counts, files, subscription: liveSubscription(billing), billingNote: Boolean(note) };
}

/** Blob URLs this shop's rows point at (crew photos, job photos, receipts, logo). */
async function shopBlobUrls(db: Db, settings: unknown) {
  const urls: string[] = [];
  const add = (url: unknown) => {
    if (typeof url === "string" && isBlobUrl(url)) urls.push(url);
  };
  add((settings as { logoUrl?: string } | null)?.logoUrl);
  const rows = async (model: string, field: string) => {
    const delegate = db[model];
    if (!delegate?.findMany) return;
    const found = (await delegate.findMany({ select: { [field]: true } }).catch(() => [])) as Record<string, unknown>[];
    for (const row of found) add(row[field]);
  };
  await rows("employee", "photoUrl");
  await rows("jobPhoto", "url");
  await rows("receipt", "url");
  return Array.from(new Set(urls));
}

async function deleteBlobUrls(urls: string[]) {
  let removed = 0;
  for (const url of urls) {
    await deleteUpload(url);
    removed += 1;
  }
  return removed;
}

/**
 * Delete one crew member's own login. Payroll records stay (employers must keep them).
 * The Account row stays as a tombstone so ensureAccounts() never quietly rebuilds the login from the
 * phone number; the PIN can never match and the invite link is gone.
 */
export async function removeCrewLogin(
  db: Db,
  input: { accountId: string; uploadsRoot?: string; now?: Date }
) {
  const account = await db.account.findUnique({ where: { id: input.accountId }, include: { employee: true } });
  if (!account || account.role !== "CREW" || !account.employeeId) return { ok: false as const };
  const employee = account.employee as { id: string; firstName: string; lastName: string; photoUrl: string | null } | null;
  await db.$transaction(async (tx: Db) => {
    await tx.account.update({
      where: { id: account.id },
      data: { pinHash: REMOVED_PIN_HASH, inviteToken: null, username: null, passwordHash: "" },
    });
    await tx.crewPing.deleteMany({ where: { employeeId: account.employeeId } });
    if (employee) {
      await tx.employee.update({ where: { id: employee.id }, data: { photoUrl: null } });
    }
    await tx.auditLog.create({
      data: {
        employeeId: account.employeeId,
        actor: account.name,
        action: "Deleted their own login",
        field: "account",
        newValue: (input.now || new Date()).toISOString(),
      },
    });
  });
  if (isBlobUrl(employee?.photoUrl)) await deleteUpload(employee?.photoUrl);
  const rel = uploadRelPath(employee?.photoUrl);
  if (rel) await unlink(path.join(input.uploadsRoot || defaultUploadsRoot(), rel)).catch(() => undefined);
  return { ok: true as const, name: account.name };
}
