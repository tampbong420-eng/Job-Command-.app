import { BRAND } from "@/lib/documents";

export type ShopIdentity = {
  businessName?: string | null;
  logoUrl?: string | null;
  businessAddress?: string | null;
  ownerFirstName?: string | null;
  ownerLastName?: string | null;
};

export function shopOwnerName(settings?: ShopIdentity | null) {
  return `${settings?.ownerFirstName || ""} ${settings?.ownerLastName || ""}`.trim();
}

function tokens(value: string) {
  return value
    .replace(/['’]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Monogram for a shop with no logo. A shop with no name yet gets the app's JC. */
export function shopInitials(name?: string | null) {
  const words = tokens(name?.trim() || "");
  if (!words.length) return "JC";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .map((word) => word[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

/** Ticket prefix from the shop's own name ("Acme Plumbing" → AP-2100). No name yet → JOB-2100. */
export function jobCodePrefix(name?: string | null) {
  return tokens(name?.trim() || "").length ? shopInitials(name) : "JOB";
}

export function nextJobCode(name: string | null | undefined, existingCount: number) {
  const serial = 2100 + Math.max(0, existingCount);
  return `${jobCodePrefix(name)}-${serial}`;
}

/** Shop-facing ticket. Legacy JC- codes from the platform seed become the shop prefix. */
export function displayJobCode(code: string, businessName?: string | null) {
  const raw = String(code || "").trim();
  const match = /^([A-Za-z]{1,4})-(\d+)$/.exec(raw);
  if (!match) return raw;
  if (match[1].toUpperCase() !== "JC") return raw;
  return `${jobCodePrefix(businessName)}-${match[2]}`;
}

export function shopPlace(address?: string | null) {
  const raw = address?.trim();
  if (!raw) return "";
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join(", ");
  return raw.length > 36 ? "" : raw;
}

export function shopBrand(settings?: ShopIdentity | null) {
  const name = settings?.businessName?.trim() || BRAND.tradeName;
  return {
    name,
    initials: shopInitials(settings?.businessName),
    logoUrl: settings?.logoUrl?.trim() || null,
    place: shopPlace(settings?.businessAddress),
  };
}
