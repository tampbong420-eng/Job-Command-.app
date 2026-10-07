/**
 * Crew invites from signup. Texting through our servers (Twilio) is on hold, so each invite opens the
 * phone's own Messages app with an sms: link that already holds the person's own sign-in link.
 * One text per person: the links are personal (they open that person's sign-in), so we never put
 * several links in one group thread. Copy link is the fallback. Client-safe.
 */
export type SignupInvite = {
  key: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: "crew" | "boss";
  url: string;
};

export function phoneDigitsForSms(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return digits;
}

export function isAppleDevice(userAgent: string) {
  return /iPhone|iPad|iPod|Macintosh/i.test(userAgent);
}

export function inviteText(input: { firstName: string; shop: string; owner: string; url: string; role: "crew" | "boss" }) {
  const hi = input.firstName.trim() ? `Hi ${input.firstName.trim()}, ` : "";
  const who = input.owner.trim() || "your boss";
  const shop = input.shop.trim() || "the shop";
  if (input.role === "boss") {
    return `${hi}${who} added you to ${shop} on Job Command. Open ${input.url} and sign in with the office PIN ${who} gives you.`;
  }
  return `${hi}${who} added you to ${shop} on Job Command. Your own sign-in link: ${input.url} — unlock with the last 4 of your phone.`;
}

/** sms: link with the text filled in. iOS reads "&body=", everything else "?body=". */
export function inviteSmsHref(phone: string, body: string, userAgent = "") {
  const to = phoneDigitsForSms(phone);
  const sep = isAppleDevice(userAgent) ? "&" : "?";
  return `sms:${to}${sep}body=${encodeURIComponent(body)}`;
}

/** "3 invites sent" / "1 invite sent" / "" when none went out. */
export function invitesSentLine(count: number) {
  if (count <= 0) return "";
  return `${count} invite${count === 1 ? "" : "s"} sent`;
}

export function inviteKey(person: { firstName: string; lastName: string; phone: string }) {
  return `${person.firstName.trim().toLowerCase()}|${person.lastName.trim().toLowerCase()}|${person.phone.replace(/\D/g, "")}`;
}
