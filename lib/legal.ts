import {
  ADDON_PLAN_DOLLARS,
  BASE_PLAN_ANNUAL_DOLLARS,
  annualMonthlyEquivalent,
  annualSavingsDollars,
  formatPlanDollars,
} from "@/lib/billing";

export const LEGAL_VERSION = "2026-10-02.7";
export const LEGAL_EFFECTIVE = "October 2, 2026";
const BASE_MONTH = `${formatPlanDollars()} per month`;
const BASE_YEAR = `${formatPlanDollars(BASE_PLAN_ANNUAL_DOLLARS)} per year`;
const ADDON_MONTH = `$${ADDON_PLAN_DOLLARS} per month`;
export const LEGAL_OPERATOR = "Job Command";
export const LEGAL_GOVERNING_LAW = "Arkansas";

export type LegalSection = {
  title: string;
  paragraphs: string[];
};

export function legalAnchor(title: string) {
  return title
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const TERMS_SECTIONS: LegalSection[] = [
  {
    title: "Agreement",
    paragraphs: [
      "These Terms & Conditions (“Terms”) are a contract between you (the contractor, shop owner, or company that opens a Job Command account) and Job Command. By checking “I agree to the Terms & Conditions and Privacy Policy” during signup, creating an account, or using the app, you accept these Terms and the Privacy Policy.",
      "Job Command is a phone-first operations tool for trade shops: leads, estimates, crew hours, dispatch, GPS pings while clocked in, and client invoicing. It is software, not a general contractor, insurer, safety officer, bank, or law firm. If you do not agree, do not finish signup and do not use the app.",
    ],
  },
  {
    title: "30-day free trial and subscriptions",
    paragraphs: [
      "New shops receive a 30-day free trial of the Base App. The trial starts when company setup is finished and you have agreed to these Terms.",
      `To start the trial we check your card with a $1 authorization hold that we release right away (your bank may show it as pending briefly). You are not charged for the Base App until the trial ends. Unless you cancel before the trial ends, your card is charged ${BASE_MONTH} starting the day the trial ends and every month after until you cancel (or ${BASE_YEAR} each year if you chose yearly billing). About 3 days before the trial ends we email a reminder with the date, the price, and a one-tap cancel link.`,
      "One free trial per business. We check the card, phone, and device used at sign-up. If that card, that device, or two or more of the phone number, email, and business name and ZIP already started a free trial, setup is still saved but no free trial is given, and you can subscribe right away.",
      `The Base App is ${BASE_MONTH} after the trial, or ${BASE_YEAR} if you choose yearly billing (about ${formatPlanDollars(annualMonthlyEquivalent())} a month, ${formatPlanDollars(annualSavingsDollars())} less than 12 monthly payments). Yearly billing is charged once for the full year in advance. That plan covers Job Command operations: Command, estimates, crew hours, dispatch, invoices, and Company. Prices are in US dollars. Taxes may apply where required.`,
      "The AI Answering Service is a separate modular add-on at $59 per month (+$59/mo). Answering is locked until you purchase that add-on on Company. The 30-day free trial does not include answering. Canceling the Base App does not keep answering active; canceling answering does not cancel the Base App.",
      "Your subscription is created when you start the trial, with the first Base App charge scheduled for the day the trial ends (Stripe trial_end), not the day of the card check. If you subscribe after the trial has ended, billing starts when checkout completes.",
    ],
  },
  {
    title: "Auto-renewal",
    paragraphs: [
      "Paid plans renew automatically each billing period (each month, or each year on yearly billing) until you cancel. Stripe (or a local demo checkout when no Stripe key is configured) charges the card on file at each renewal for the Base App and, if purchased, the AI Answering Service.",
      `You authorize recurring charges of ${BASE_MONTH} for the Base App (or ${BASE_YEAR} on yearly billing, renewing each year until you cancel) and ${ADDON_MONTH} for answering when that add-on is active. Failed renewals can move the account to past due. Job Command may suspend paid features after repeated failures.`,
      "On yearly billing we email a reminder about 30 days before each yearly renewal with the renewal date, the amount, and how to cancel online.",
    ],
  },
  {
    title: "Cancellation",
    paragraphs: [
      "Cancel in Company → Billing, or through the Stripe customer portal when Stripe is connected, before the next renewal to avoid the next month’s (or, on yearly billing, the next year’s) charge. Cancellation of the Base App or the answering add-on takes effect at the end of the then-current paid period. You keep access you already paid for until that period ends.",
      "Canceling during the free trial (from the reminder email, the in-app banner, or Company → Billing) ends the trial right away and nothing is charged.",
      "If the trial ends with no active base subscription, office users cannot send estimates or invoices until they subscribe. Crew clock-in, hours, and field job views still work. Past-due accounts stay unlocked long enough to update a card; canceled or expired accounts follow the same send lock until you resubscribe.",
      "Subscription fees already charged are not refunded for unused days in a month, except where the law requires otherwise. Turning off answering stops future answering charges; it does not refund the current add-on month.",
    ],
  },
  {
    title: "Stripe Connect, card processing, and merchant payouts",
    paragraphs: [
      "Client invoice card payments are processed by Stripe. Job Command never stores full card numbers or bank account numbers. When you link a bank with Stripe Connect on the Company tab, customer payments are merchant payouts to your connected Stripe account under Stripe’s terms.",
      "You must complete Connect onboarding, keep payout details accurate, and comply with Stripe’s Connected Account Agreement and Stripe’s Services Agreement. Payout timing, reserves, and identity checks are Stripe’s. Job Command is not a bank, money transmitter, or escrow agent. Funds sit with Stripe, not in a Job Command wallet.",
      "If Connect is not linked, you cannot collect client cards through Job Command. A mock checkout may appear in local development when no Stripe secret is configured; that mock does not move real money.",
    ],
  },
  {
    title: "1% platform fee",
    paragraphs: [
      "Job Command keeps a 1% platform fee on client invoice charges collected through the app, applied as a Stripe application_fee. You receive the remaining 99% as the merchant payout. Example: a $222 invoice yields $2.22 to Job Command and $219.78 to you, before Stripe’s own processing fees, which Stripe charges separately under Stripe’s terms.",
      `You authorize Job Command to instruct Stripe to collect that automated 1% platform fee and to transfer the rest to your connected account. Subscriptions for the Base App (${formatPlanDollars()}/mo or ${formatPlanDollars(BASE_PLAN_ANNUAL_DOLLARS)}/yr) and the AI Answering Service (+$${ADDON_PLAN_DOLLARS}/mo) are separate from client invoice charges. Those subscription amounts are paid by you to Job Command. The 1% fee applies only to client invoice card payments generated through Job Command.`,
    ],
  },
  {
    title: "Estimates, hours, and field operations",
    paragraphs: [
      "Estimates, invoices, materials lists, labor hours, GPS pins, dispatch notes, weather, maps, and AI talk-back are operational aids. They can be late, incomplete, wrong, or unavailable when a phone has no signal. You must confirm hours, prices, quantities, and site facts before you send a bid or invoice or pay a crew.",
      "Job Command does not supervise crews, inspect sites, or replace your books, payroll filings, or contracts with customers. Missed punches, bad GPS, delayed dispatch, and estimate or invoice errors are your shop’s to correct.",
    ],
  },
  {
    title: "Limitation of liability",
    paragraphs: [
      "You use Job Command on active job sites at your own risk. Job Command does not certify safety, run toolbox talks, or replace OSHA programs, insurance, licenses, or your duty to keep people safe. Job-site safety notes in the app are reminders you type or speak; they are not a safety program, training, or legal compliance system.",
      "You remain responsible for means and methods, fall protection, chemicals, vehicles, and every person you send to a site. Field operations, crew hour tracking, estimates, and safety notes in Job Command do not shift that duty to us.",
      `To the fullest extent allowed by law, Job Command and its operators are not liable for injury, death, property damage, lost jobs, missed punches, bad GPS, delayed dispatch, estimate or invoice errors, or lost profits arising from use of the app on a job site or in the shop. If a court nonetheless finds liability, it is limited to the fees you paid Job Command in the three months before the claim, or ${formatPlanDollars()}, whichever is greater.`,
      "The app is provided “as is.” We do not warrant uninterrupted service, perfect GPS, or that AI parsing of voice, photos, or notes will match the job.",
    ],
  },
  {
    title: "Your account and crew",
    paragraphs: [
      "Office PINs and field invite links control who sees payroll, Company, and job cost. You must keep PINs and invite links inside the shop. You are responsible for crew you invite and for data they save (photos, notes, locations).",
      "Do not use the app to track people who have not been told that clock-in can share a live location with the office while they are on the clock.",
    ],
  },
  {
    title: "Changes",
    paragraphs: [
      `These Terms are effective ${LEGAL_EFFECTIVE} (version ${LEGAL_VERSION}). We may update them. Continued use after a posted change is acceptance of the new Terms. The current version always lives at /terms.`,
    ],
  },
  {
    title: "Governing law",
    paragraphs: [
      `These Terms are governed by the laws of the State of ${LEGAL_GOVERNING_LAW}, without regard to conflict-of-law rules. Courts in ${LEGAL_GOVERNING_LAW} have exclusive venue, except where applicable law requires otherwise.`,
      "Questions about billing or these Terms: email jobcommandofficial@gmail.com.",
    ],
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: "What this covers",
    paragraphs: [
      `This Privacy Policy explains what Job Command collects when you run the shop on this app, and how that data is used. It is effective ${LEGAL_EFFECTIVE} (version ${LEGAL_VERSION}). By agreeing at signup you also accept this policy.`,
    ],
  },
  {
    title: "Account and shop data",
    paragraphs: [
      "We store business name, address, owner name, email, phones, crew names, job titles, pay rates, hours, customers, estimates, invoices, photos you attach to jobs, dispatch notes, job-site safety notes you enter, and PIN hashes (not the PIN itself in the clear).",
      "If you subscribe, Stripe stores card and bank details. Job Command keeps only what Stripe returns for the desk: brand, last four, Connect account status, and subscription ids. We do not store full card numbers or bank account numbers on the phone or in our database.",
    ],
  },
  {
    title: "Location, clock, and job-site use",
    paragraphs: [
      "While a field phone is clocked in, the app may send GPS pings so the office can see who is on a job. Those pings are for dispatch and hours, not public sharing. Turn the phone off the clock if you do not want a live pin.",
      "Weather and maps use the job address and, when available, coordinates. Drive times may call Google or OpenStreetMap. That traffic goes to those providers under their policies.",
    ],
  },
  {
    title: "AI assistant",
    paragraphs: [
      "Job Command's AI helper is a server-side model run by OpenAI (GPT-4o mini, and Whisper for voice clips), reached from the Job Command server through Vercel's AI Gateway. Your phone never talks to OpenAI directly.",
      "Before anything goes to OpenAI, the app asks each person on each phone. If you allow it, Job Command sends: the words you say into the mic and short site voice clips; up to 4 job photos per job, with the job name, address, and notes; and what you type for leads, estimate and invoice lines, and job notes. It is used only to draft notes, line items, lead details, and hours for you.",
      "Never sent to OpenAI: PINs, bank or card numbers, Social Security numbers, payroll, or your contacts list. OpenAI says it does not train its models on data sent through its API.",
      "If you choose Not now, nothing goes to OpenAI: the server refuses the AI step and the mic and typing still work with Job Command's own parser (rougher drafts). You can change your answer any time on the Company tab (office) or under My account (crew). Do not put secrets, Social Security numbers, or medical details in job talk.",
    ],
  },
  {
    title: "Payments",
    paragraphs: [
      "Client invoice links and shop subscriptions are processed by Stripe. Stripe receives the amount, the automated 1% platform fee on client invoices, and your connected account when you have linked a bank for merchant payouts. Stripe’s privacy policy governs card data in their systems.",
      "The $1 card check at sign-up is an authorization hold placed and released through Stripe. Your card number goes to Stripe, not to us.",
      "One free trial per business: we keep a keyed hash (never the value itself) of the card fingerprint Stripe returns, the owner phone and email, the business name and ZIP, and, in the phone apps, an install ID. We use these hashes only to spot repeat free trials, and keep them for 24 months after the trial starts.",
    ],
  },
  {
    title: "Cookies and session",
    paragraphs: [
      "The shop session cookie (jc_session) is HttpOnly, SameSite=Strict, and Secure in production. It lasts 30 days on that device. It is not available to JavaScript. We do not run third-party advertising cookies on the phone shell.",
    ],
  },
  {
    title: "What we do not do",
    paragraphs: [
      "We do not sell shop or crew lists. We do not run third-party advertising SDKs on the phone shell.",
      "Webhooks from Stripe, Resend, and Twilio post to public HTTPS routes so those vendors can confirm delivery and payment. Those routes verify signatures when a webhook secret is set.",
    ],
  },
  {
    title: "Retention and contact",
    paragraphs: [
      "Job photos, hours, and invoices stay until you delete the job or reset the shop database. You can lock a phone from the header. For a copy or deletion request, email jobcommandofficial@gmail.com.",
      "Delete your account in the app: the office can delete the whole shop (every login, job, photo, and record) on the Company tab, and a crew member can delete their own login under My account on their home screen. A deleted login stops working on every phone. A crew member's past hours and pay records stay with the shop because the shop must keep payroll records.",
      "Job Command is for shops, not children. Do not create an account for anyone under 16.",
    ],
  },
];
