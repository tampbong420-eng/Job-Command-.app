import { BRAND } from "@/lib/documents";

export function estimateMessage(input: {
  who: string;
  company: string;
  jobName: string;
  site?: string;
  total?: string;
  url: string;
  followUp?: "unviewed" | "unsigned";
  /** The shop's town line ("Tulsa, OK"). Left off when empty. */
  place?: string;
}) {
  const company = input.company.trim() || BRAND.tradeName;
  const place = input.place?.trim() || "";
  const site = input.site ? ` at ${input.site}` : "";
  const total = input.total ? ` Total ${input.total}.` : "";
  const opener =
    input.followUp === "unviewed"
      ? `Hey ${input.who} — just checking you saw the estimate from ${company} for ${input.jobName}.`
      : input.followUp === "unsigned"
        ? `Hey ${input.who}, we still need a signature on ${input.jobName} when you’ve got a minute.`
        : `Hi ${input.who},\n\nHere’s the number from ${company} for ${input.jobName}${site}.${total}`;
  const text = `${opener}\n\nLook it over and approve on your phone:\n${input.url}\n\n${company}${place ? `\n${place}` : ""}`;
  const sms =
    input.followUp === "unviewed"
      ? `${company}: still waiting on you to open the ${input.jobName} estimate ${input.url}`
      : input.followUp === "unsigned"
        ? `${company}: still need a signature on ${input.jobName} ${input.url}`
        : `${company}: here’s the number for ${input.jobName}. Review & sign ${input.url}`;
  const subject =
    input.followUp === "unviewed"
      ? `Did you see the ${company} estimate?`
      : input.followUp === "unsigned"
        ? `Still need a signature — ${input.jobName}`
        : `Estimate from ${company} — ${input.jobName}`;
  const html = `<div style="font-family:Inter,Helvetica,Arial,sans-serif;background:#f6f5f2;color:#161616;padding:32px">
  <p style="letter-spacing:.14em;text-transform:uppercase;font-size:11px;color:#6b6b6b;font-weight:600">${company}</p>
  <h1 style="font-size:22px;margin:8px 0 16px;font-weight:650">Your estimate</h1>
  <p style="line-height:1.5;color:#3f3f46">${opener.replace(/\n/g, "<br/>")}</p>
  <p><a href="${input.url}" style="display:inline-block;background:#161616;color:#fafafa;text-decoration:none;padding:14px 18px;border-radius:10px;font-weight:600">Review &amp; approve</a></p>
  ${place ? `<p style="color:#71717a;font-size:13px">${place}</p>` : ""}
</div>`;
  return { subject, text, html, sms };
}

export function invoiceMail(input: {
  who: string;
  jobName: string;
  number?: string;
  total: string;
  company?: string;
  url?: string;
  fee?: string;
  /** The shop's town line ("Tulsa, OK"). Left off when empty. */
  place?: string;
  /** False when card payments are not set up: the link only shows the invoice. Default true. */
  cardReady?: boolean;
}) {
  const who = input.who.trim() || "there";
  const company = input.company?.trim() || BRAND.tradeName;
  const place = input.place?.trim() || "";
  const number = input.number?.trim() ? ` ${input.number.trim()}` : "";
  const card = input.cardReady !== false;
  const pay = input.url ? (card ? `\n\nPay by card on your phone:\n${input.url}` : `\n\nView your invoice:\n${input.url}`) : "";
  const smsPay = input.url ? (card ? ` Pay ${input.url}` : ` View ${input.url}`) : "";
  const buttonLabel = card ? "Pay by card" : "View invoice";
  const text = `Hi ${who},\n\nHere’s invoice${number} for ${input.jobName}. Total ${input.total}.${pay}\n\nGive us a ring if anything looks off.\n\n${company}${place ? `\n${place}` : ""}`;
  const html = `<div style="font-family:Inter,Helvetica,Arial,sans-serif;background:#f6f5f2;color:#161616;padding:32px">
  <p style="letter-spacing:.14em;text-transform:uppercase;font-size:11px;color:#6b6b6b;font-weight:600">${company}</p>
  <h1 style="font-size:22px;margin:8px 0 16px;font-weight:650">Invoice${number}</h1>
  <p style="line-height:1.5;color:#3f3f46">Hi ${who} — total ${input.total} for ${input.jobName}.</p>
  ${
    input.url
      ? `<p><a href="${input.url}" style="display:inline-block;background:#161616;color:#fafafa;text-decoration:none;padding:14px 18px;border-radius:10px;font-weight:600">${buttonLabel}</a></p>`
      : ""
  }
  ${place ? `<p style="color:#71717a;font-size:13px">${place}</p>` : ""}
</div>`;
  return {
    subject: `Invoice${number} from ${company} — ${input.jobName}`,
    body: text,
    text,
    html,
    sms: `${company}: invoice${number} for ${input.jobName} is ${input.total}.${smsPay}`,
  };
}
