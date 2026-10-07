import { BRAND } from "@/lib/documents";
import { crewJoinUrl } from "@/lib/origin";

export function inviteShareText(name: string, url: string, company?: string | null) {
  const who = name.trim() || "the crew";
  const shop = company?.trim() || BRAND.tradeName;
  return `${shop} for ${who}. Open ${url} and unlock with the last four of your phone.`;
}

export function inviteHref(origin: string, token: string) {
  return crewJoinUrl(origin, token);
}
