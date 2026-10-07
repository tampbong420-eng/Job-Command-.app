// Server only (node:crypto). Go-public B5: bank numbers are encrypted at rest.
//
// AES-256-GCM with a random 12-byte IV per value and the row + field name as associated data, so a
// stored value can't be copied onto another person's row. Stored form: "enc:v1:<iv>:<tag>:<data>" (base64url).
// Key: FIELD_ENCRYPTION_KEY = 32 random bytes as base64 (or 64 hex chars).
//   Make one:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// Local dev: if the key is missing, one is made once and written to .env.local (never committed).
// Production (Vercel): no key = bank numbers can't be saved (clear error), and saved ones read as "".
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { appendFileSync, existsSync, readFileSync } from "fs";
import path from "path";

const PREFIX = "enc:v1:";

function isProductionEnv(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === "production" || env.VERCEL === "1";
}

export function parseFieldKey(raw: string | undefined | null): Buffer | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (/^[0-9a-f]{64}$/i.test(value)) return Buffer.from(value, "hex");
  try {
    const bytes = Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

/** Dev only: read FIELD_ENCRYPTION_KEY from .env.local, or make one and save it there. */
function devKey(): Buffer | null {
  if (isProductionEnv()) return null;
  const file = path.join(process.cwd(), ".env.local");
  try {
    if (existsSync(file)) {
      const line = readFileSync(file, "utf8")
        .split(/\r?\n/)
        .find((row) => row.startsWith("FIELD_ENCRYPTION_KEY="));
      const key = parseFieldKey(line?.slice("FIELD_ENCRYPTION_KEY=".length).replace(/^"|"$/g, ""));
      if (key) {
        process.env.FIELD_ENCRYPTION_KEY = key.toString("base64");
        return key;
      }
    }
    const fresh = randomBytes(32).toString("base64");
    appendFileSync(file, `\n# Local dev key for bank-number encryption (lib/field-crypto.ts). Never commit. Vercel needs its own.\nFIELD_ENCRYPTION_KEY=${fresh}\n`);
    process.env.FIELD_ENCRYPTION_KEY = fresh;
    return Buffer.from(fresh, "base64");
  } catch {
    return null;
  }
}

export function fieldKey(): Buffer | null {
  return parseFieldKey(process.env.FIELD_ENCRYPTION_KEY) || devKey();
}

export function isEncryptedField(value: string | null | undefined) {
  return String(value || "").startsWith(PREFIX);
}

const b64 = (buf: Buffer) => buf.toString("base64url");

/** Encrypt one value. "" stays "". Throws when there is no key (never stores plain text instead). */
export function encryptField(plain: string, context: string, key: Buffer | null = fieldKey()): string {
  if (!plain) return "";
  if (!key) throw new Error("Bank details can't be saved yet: the shop's encryption key (FIELD_ENCRYPTION_KEY) is not set.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${PREFIX}${b64(iv)}:${b64(cipher.getAuthTag())}:${b64(data)}`;
}

/** Decrypt one value. Old plain values come back as they are (until the migration runs). Bad/no key → "". */
export function decryptField(stored: string | null | undefined, context: string, key: Buffer | null = fieldKey()): string {
  const value = String(stored || "");
  if (!value) return "";
  if (!isEncryptedField(value)) return value;
  if (!key) return "";
  try {
    const [iv, tag, data] = value.slice(PREFIX.length).split(":");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

/** Associated data for an employee's bank field. */
export function bankContext(employeeId: string, field: "depositRouting" | "depositAccount") {
  return `employee:${employeeId}:${field}`;
}

export function last4(value: string) {
  return value.replace(/\D/g, "").slice(-4);
}
