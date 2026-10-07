/**
 * Conditional call forwarding steps for the setup page. Codes differ by carrier and plan, so the page shows a
 * generic set plus the common US carriers, and always says "check with your carrier". iPhone will not dial
 * * or # codes from a link, so these are typed into the phone's keypad by hand.
 */

export function digitsOnly(value: string) {
  return String(value || "").replace(/\D/g, "");
}

/** 10-digit US number for forwarding codes ("" when it isn't one). */
export function tenDigits(value: string) {
  const digits = digitsOnly(value);
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.length === 10 ? digits : "";
}

export function prettyUs(value: string) {
  const ten = tenDigits(value);
  return ten ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : String(value || "").trim();
}

export function toE164(value: string) {
  const ten = tenDigits(value);
  return ten ? `+1${ten}` : "";
}

export type ForwardingCarrier = {
  id: string;
  name: string;
  on: string; // what to dial to turn on "forward when I don't answer / busy / off"
  off: string;
  note: string;
};

const SLOT = "NUMBER";

export const FORWARDING_CARRIERS: ForwardingCarrier[] = [
  {
    id: "generic",
    name: "Most cell phones",
    on: `**004*1${SLOT}#`,
    off: "##004#",
    note: "Forwards when you don't answer, are busy, or have no signal.",
  },
  {
    id: "att",
    name: "AT&T",
    on: `**61*1${SLOT}**20#`,
    off: "##61#",
    note: "No-answer forward after 20 seconds. Busy: **67*1NUMBER#. No signal: **62*1NUMBER#.",
  },
  {
    id: "tmobile",
    name: "T-Mobile",
    on: `**61*1${SLOT}#`,
    off: "##61#",
    note: "No-answer forward. Busy: **67*1NUMBER#. No signal: **62*1NUMBER#. All three: **004*1NUMBER#.",
  },
  {
    id: "verizon",
    name: "Verizon",
    on: `*71${SLOT}`,
    off: "*73",
    note: "Busy and no-answer forwarding. Some plans need it turned on in My Verizon first.",
  },
  {
    id: "landline",
    name: "Office line or VoIP",
    on: "Set in your phone service's app or website",
    off: "Same place",
    note: "Look for \"Forward when no answer\" or \"Call handling\" and enter your new 501 number.",
  },
];

/** The dial string for a carrier with the forwarding number filled in. */
export function forwardingCode(carrier: ForwardingCarrier, forwardTo: string) {
  const ten = tenDigits(forwardTo);
  if (!ten || !carrier.on.includes(SLOT)) return carrier.on;
  return carrier.on.replace(SLOT, ten);
}

export function forwardingOff(carrier: ForwardingCarrier) {
  return carrier.off;
}
