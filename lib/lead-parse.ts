export type LeadFields = {
  clientName: string | null;
  phone: string | null;
  address: string | null;
  scopeOfWork: string | null;
  preferredTimeline: string | null;
};

const NAME_STOP = new Set([
  "the",
  "a",
  "an",
  "her",
  "him",
  "them",
  "us",
  "me",
  "this",
  "that",
  "next",
  "week",
  "today",
  "tomorrow",
  "asap",
  "back",
  "about",
  "from",
  "with",
  "at",
  "on",
  "in",
  "to",
  "for",
  "phone",
  "number",
  "address",
  "street",
  "out",
]);

const PHONE_RE = /(?:\+?1[-.\s]?)?(?:\(?(\d{3})\)?[-.\s]?)(\d{3})[-.\s]?(\d{4})\b/;
const STREET_RE =
  /\b(\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){0,5}(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Court|Ct|Circle|Cir|Highway|Hwy|Place|Pl|Trail|Trl|Parkway|Pkwy)\.?)\b/i;
const ADDRESS_HINT =
  /(?:address(?:\s+is)?|property(?:\s+(?:is|at))?|job site(?:\s+(?:is|at))?|site(?:\s+(?:is|at))?|lives? at|over at|out at)\s+([^.,;]+)/i;
const NAME_HINT =
  /(?:client|customer|homeowner|home owner|owner|name)(?:\s+is|'s)?\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,3})/i;
const TALKED_HINT =
  /(?:this is|it's|its|talked to|spoke with|spoke to|called|call|met(?:\s+with)?)\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)?)/i;
const TIMELINE_HINT =
  /\b(asap|as soon as possible|right away|this week|next week|this weekend|next weekend|today|tomorrow|end of (?:the )?(?:week|month)|in \d+ weeks?|in a month|by (?:next )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week))\b/i;
const TIMELINE_LABEL = /(?:preferred(?:\s+timeline)?|timeline|when they want(?:\s+us)?|schedule(?:\s+them)?)\s*(?:is|:)?\s+([^.,;]+)/i;
const SCOPE_HINT =
  /(?:scope(?:\s+of\s+work)?|needs|wants|looking to|looking for|work is)[:\s]+(.{8,220}?)(?:\.|$)/i;

function titleCase(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function cleanName(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter((word) => !NAME_STOP.has(word.toLowerCase()))
    .join(" ");
}

function looksLikeName(value: string) {
  const words = cleanName(value).split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 4) return false;
  return words.every((word) => /^[A-Za-z][A-Za-z'-]*$/.test(word));
}

function cleanScope(value: string) {
  return value.replace(/\s+/g, " ").replace(/^[\s:,-]+/, "").replace(/[.,]$/, "").trim();
}

export function emptyLeadFields(): LeadFields {
  return {
    clientName: null,
    phone: null,
    address: null,
    scopeOfWork: null,
    preferredTimeline: null,
  };
}

export function parseLeadTalk(text: string): LeadFields {
  const raw = text.replace(/\s+/g, " ").trim();
  if (!raw) return emptyLeadFields();

  const fields = emptyLeadFields();
  let leftover = raw;

  const phone = raw.match(PHONE_RE);
  if (phone) {
    fields.phone = `${phone[1]}-${phone[2]}-${phone[3]}`;
    leftover = leftover.replace(phone[0], " ");
  }

  const street = leftover.match(STREET_RE);
  const hinted = leftover.match(ADDRESS_HINT);
  if (street) {
    fields.address = titleCase(street[1].replace(/\.$/, ""));
    leftover = leftover.replace(street[0], " ");
  } else if (hinted) {
    // Keep the town and state they said: it's part of the address (no shop's town is built in).
    const address = hinted[1].replace(/\s+/g, " ").trim();
    if (address.length >= 5) {
      fields.address = titleCase(address);
      leftover = leftover.replace(hinted[0], " ");
    }
  }

  const named = leftover.match(NAME_HINT) || leftover.match(TALKED_HINT);
  if (named && looksLikeName(named[1])) {
    fields.clientName = titleCase(cleanName(named[1]));
    leftover = leftover.replace(named[0], " ");
  }

  const labeledTime = leftover.match(TIMELINE_LABEL);
  const timed = leftover.match(TIMELINE_HINT);
  if (labeledTime && labeledTime[1].trim().length > 1) {
    fields.preferredTimeline = labeledTime[1].trim().replace(/\.$/, "");
    leftover = leftover.replace(labeledTime[0], " ");
  } else if (timed) {
    fields.preferredTimeline = timed[1].toLowerCase() === "asap" ? "ASAP" : timed[1].toLowerCase();
    leftover = leftover.replace(timed[0], " ");
  }

  const scoped = leftover.match(SCOPE_HINT);
  if (scoped) {
    fields.scopeOfWork = cleanScope(scoped[0].replace(/^(scope(?:\s+of\s+work)?|needs|wants)\s*(is|:)?\s*/i, ""));
  }

  leftover = leftover
    .replace(/[.,;]+/g, " ")
    .replace(/\b(phone|number|address|client|customer|name|is|at|on|for|the|a|an|and|to|of|she|he|they|would|like|us)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!fields.scopeOfWork && leftover.length >= 8) {
    fields.scopeOfWork = cleanScope(leftover);
  }

  return fields;
}

export function mergeLeadFields(current: LeadFields, next: LeadFields, mode: "empty" | "force"): LeadFields {
  const pick = (a: string | null, b: string | null) => {
    if (mode === "force" && b) return b;
    return a?.trim() ? a : b;
  };
  return {
    clientName: pick(current.clientName, next.clientName),
    phone: pick(current.phone, next.phone),
    address: pick(current.address, next.address),
    scopeOfWork: pick(current.scopeOfWork, next.scopeOfWork),
    preferredTimeline: pick(current.preferredTimeline, next.preferredTimeline),
  };
}
