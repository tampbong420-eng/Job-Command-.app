"use client";

/**
 * First launch — signup v2 (approved 2026-10-02, mockups in /workspace/mockups/signup).
 * 5 sections (You / Shop / Crew / Paid / Ready), 1–2 big questions per screen, one orange
 * Next ("Looks right" when I already filled it), "Skip for now" only where it's safe.
 * Theme, pay period, crew rates, books, answering line, bank, logo, license, and insurance
 * moved out of signup: each is asked right when it matters (see laterItems).
 * Voice: the one floating mic (OneMic) types into whichever box is selected.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { createJob, saveLead, startBillingCheckout } from "@/app/actions";
import { recordInvitesSent, saveShopExtras } from "@/app/signup-actions";
import { OfficialSheet } from "@/components/signup/OfficialSheet";
import {
  CardBlocked,
  CardChecking,
  CardDeclined,
  CardEntry,
  CardOk,
  CARD_CHECK_CONNECTED,
  CARD_NOT_CONNECTED_LINE,
  readDeviceId,
  type CardEntryHandle,
  type CardPhase,
} from "@/components/signup/CardCheck";
import { ARROW, Sheet, cx } from "@/components/signup/SignupSheet";
import { useTalkScope } from "@/components/command/OneMic";
import { barlowCondensed, barlowSemi } from "@/components/signup/fonts";
import { SignupIcon } from "@/components/signup/SignupIcon";
import s from "@/components/signup/signup.module.css";
import { prettyPhone } from "@/lib/answering-line";
import { formatAnnualPlanPrice, formatFlatPlanPrice } from "@/lib/billing";
import type { AddressHit } from "@/lib/address-suggest";
import { mostRecentWeekday, snapToWeekday, todayString } from "@/lib/dates";
import { DEPOSIT_CHOICES, parsePayTalk } from "@/lib/pay-prefs";
import { parseAccountTalk, parseBrandTalk, parsePeopleTalk, parseSizeTalk } from "@/lib/setup-parse";
import { DEFAULT_SHELL_THEME } from "@/lib/shell-theme";
import {
  SECTIONS,
  SIGNUP_STEPS,
  SIZES,
  buildSignupPayload,
  canSkip,
  doneSummary,
  laterItems,
  nextLabel,
  nextStepKey,
  pinFor,
  prevStepKey,
  profileFor,
  sectionFill,
  sectionIndex,
  signupFromSettings,
  skipLabel,
  stepIndex,
  stepProblem,
  timeLeft,
  townFrom,
  tradeName,
  withTrade,
  type SignupPerson,
  type SignupState,
  type SignupStepKey,
} from "@/lib/signup-flow";
import { contactSource, initials, pickContacts as pickPhoneContacts, type ContactSource } from "@/lib/signup-contacts";
import { inviteKey, inviteSmsHref, inviteText, type SignupInvite } from "@/lib/signup-invites";
import { RADIUS_CHOICES, WORK_DAYS, formatClock } from "@/lib/signup-shop";
import { formatExtra, pickerProfiles, otherProfile, tradeProfile } from "@/lib/trade-profiles";
import type { PayrollSettingsDTO } from "@/lib/types";

type Landing = { href: string; route: "pipeline" | "billing"; verified?: boolean; invites?: SignupInvite[] };
type SheetKind = "later" | "official" | "review" | "job" | "person" | "invites" | "signin" | null;

/** Monthly plan price from lib/billing (e.g. "$199/mo"), so signup copy follows any price change. */
function planPrice() {
  return formatFlatPlanPrice();
}

/** Both billing choices from lib/billing, e.g. "$199/mo or $1,990/yr". */
function planPrices() {
  return `${formatFlatPlanPrice()} or ${formatAnnualPlanPrice()}`;
}

/** Footer button words on "Free for 14 days" (mockups 09 / 09b / 09c / 09d). */
function trialButton(card: CardPhase, pending: boolean) {
  if (card.phase === "checking") return "Checking…";
  if (card.phase === "ok") return pending ? "Setting up…" : "Finish setup";
  if (card.phase === "declined") return "Try another card";
  if (card.phase === "blocked") return pending ? "Opening checkout…" : card.subscribe;
  return "Start free trial";
}

/** "Think this is wrong?" goes to the shop's support line once Eric sets one. */
function trialHelpHref() {
  const sms = process.env.NEXT_PUBLIC_SUPPORT_SMS || "";
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "";
  if (sms) return `sms:${sms}?&body=${encodeURIComponent("My free trial was blocked at sign-up. Can you check it?")}`;
  if (email) return `mailto:${email}?subject=${encodeURIComponent("Free trial blocked at sign-up")}`;
  return "/terms";
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function CompanySetup({
  settings,
  onDone,
}: {
  settings: PayrollSettingsDTO;
  onDone?: (result?: Landing) => void;
}) {
  const today = todayString();
  // Blank on first run; a finished shop re-opening setup (settings.setupComplete && settings.industry) gets its answers back.
  const [state, setState] = useState<SignupState>(() => signupFromSettings(settings));
  const [step, setStep] = useState<SignupStepKey>(settings.setupComplete ? "you" : "welcome");
  const [problem, setProblem] = useState("");
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [landing, setLanding] = useState<Landing | null>(null);
  // $1 card check on "Free for 14 days" (enter → checking → ok | declined | blocked).
  const [card, setCard] = useState<CardPhase>({ phase: "enter" });
  const [cardReady, setCardReady] = useState(false);
  const cardEntry = useRef<CardEntryHandle>(null);
  const [contacts, setContacts] = useState<ContactSource>("none");
  /** Add / edit one person (index -1 = new). */
  const [editing, setEditing] = useState<{ index: number; person: SignupPerson } | null>(null);
  const [sentKeys, setSentKeys] = useState<string[]>([]);
  const [tipOpen, setTipOpen] = useState(false);
  const [scrolledTrades, setScrolledTrades] = useState(false);
  const [addrHits, setAddrHits] = useState<AddressHit[]>([]);
  const [addrFocus, setAddrFocus] = useState(false);
  const addrPicked = useRef("");
  const firstNameRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  const current = SIGNUP_STEPS[stepIndex(step)];
  const profile = profileFor(state);
  const prefilled = Boolean(settings.setupComplete && settings.industry);

  function patch(next: Partial<SignupState>) {
    setState((value) => ({ ...value, ...next }));
    setProblem("");
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || step !== "trade") return;
    setScrolledTrades(false);
    const onScroll = () => el.scrollTop > 40 && setScrolledTrades(true);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [step]);

  // Shop address: suggestions while typing (Google Places with a Maps key, else OpenStreetMap).
  useEffect(() => {
    const q = state.address.trim();
    if (step !== "company" || !addrFocus || q.length < 5 || !/\d/.test(q) || q === addrPicked.current) {
      setAddrHits([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/setup/address?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const payload = (await response.json().catch(() => ({}))) as { hits?: AddressHit[] };
        setAddrHits(Array.isArray(payload.hits) ? payload.hits.slice(0, 3) : []);
      } catch {
        /* typing on; suggestions are a nicety */
      }
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [state.address, step, addrFocus]);

  useEffect(() => {
    // Steps are not read aloud (Eric, 2026-10-02: no robot voice). The words stay on screen.
    scrollRef.current?.scrollTo({ top: 0 });
    setProblem("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    setContacts(contactSource());
    try {
      setTipOpen(window.localStorage.getItem("jc-signup-mic-tip") !== "seen");
    } catch {
      setTipOpen(true);
    }
  }, []);

  function closeTip() {
    setTipOpen(false);
    try {
      window.localStorage.setItem("jc-signup-mic-tip", "seen");
    } catch {
      /* private mode */
    }
  }

  // The one floating mic: a selected box gets the words typed in; otherwise this parses the screen.
  useTalkScope(
    step === "welcome" || step === "trial"
      ? null
      : {
          id: "company-setup",
          label: "Setup",
          dest: current.title,
          priority: 40,
          examples: talkExamples(step),
          parse: (text) => applyTalk(text),
        }
  );

  function applyTalk(text: string) {
    if (step === "you") {
      const draft = parseAccountTalk(text);
      patch({
        ...(draft.firstName ? { firstName: draft.firstName } : {}),
        ...(draft.lastName ? { lastName: draft.lastName } : {}),
        ...(draft.email ? { email: draft.email } : {}),
        ...(draft.phone ? { cell: prettyPhone(draft.phone) } : {}),
      });
    }
    if (step === "trade") {
      const industry = parseSizeTalk(text).industry;
      if (industry) setState((value) => withTrade(value, tradeProfile(industry).id));
    }
    if (step === "company") {
      const draft = parseBrandTalk(text);
      patch({
        ...(draft.businessName ? { companyName: draft.businessName } : {}),
        ...(draft.address ? { address: draft.address } : {}),
      });
    }
    if (step === "size") {
      const size = parseSizeTalk(text).size;
      const hit = SIZES.find((item) => item.id === size);
      if (hit) pickSize(hit.id);
    }
    if (step === "people") addPeopleFromText(text);
    if (step === "methods") {
      const draft = parsePayTalk(text);
      patch({
        ...(draft.acceptCard !== undefined ? { acceptCard: draft.acceptCard } : {}),
        ...(draft.acceptAch !== undefined ? { acceptAch: draft.acceptAch } : {}),
        ...(draft.acceptCash !== undefined ? { acceptCash: draft.acceptCash } : {}),
      });
    }
  }

  function addPeopleFromText(text: string) {
    // One person per line (a pasted list), or one spoken run-on line.
    const lines = text.split(/\r?\n|;/).map((line) => line.trim()).filter(Boolean);
    const found: SignupPerson[] = lines.flatMap((line) => parsePeopleTalk(line)).map((person) => ({
      firstName: person.firstName,
      lastName: person.lastName,
      phone: person.phone ? prettyPhone(person.phone) : "",
      role: "crew",
    }));
    if (!found.length) {
      toast.error("I didn’t catch any names. One person per line: name and phone.");
      return 0;
    }
    setState((value) => ({ ...value, people: [...value.people.filter((p) => p.firstName.trim() || p.phone.trim()), ...found] }));
    return found.length;
  }

  /** From contacts: the phone's picker (Android Chrome / native app); elsewhere the name & phone sheet. */
  async function fromContacts() {
    if (contacts === "none") {
      setEditing({ index: -1, person: { firstName: "", lastName: "", phone: "", role: "crew" } });
      setSheet("person");
      return;
    }
    const found = await pickPhoneContacts();
    if (found.length) {
      setState((value) => {
        const known = new Set(value.people.map((person) => inviteKey(person)));
        return { ...value, people: [...value.people, ...found.filter((person) => !known.has(inviteKey(person)))] };
      });
    }
  }

  /**
   * Fill from Apple / Google. Real "Sign in with Apple/Google" needs OAuth client IDs (not set up yet), so:
   * Google on Android/Chrome opens the phone's contact picker (pick your own card); otherwise we focus
   * First name so iOS AutoFill ("AutoFill Contact") or Chrome/Google autofill offers the saved card.
   */
  async function fillFrom(source: "apple" | "google") {
    if (source === "google" && contacts === "web") {
      const [me] = await pickPhoneContacts();
      if (me) {
        patch({
          firstName: me.firstName || state.firstName,
          lastName: me.lastName || state.lastName,
          ...(me.phone ? { cell: prettyPhone(me.phone) } : {}),
        });
        return;
      }
    }
    firstNameRef.current?.focus();
    toast.message(source === "apple" ? "Tap “AutoFill Contact” above the keyboard." : "Pick your saved Google info above the keyboard.");
  }

  function openPerson(index: number) {
    const person = index >= 0 ? state.people[index] : { firstName: "", lastName: "", phone: "", role: "crew" as const };
    setEditing({ index, person: { ...person } });
    setSheet("person");
  }

  function savePerson(person: SignupPerson | null) {
    const index = editing?.index ?? -1;
    setState((value) => {
      if (!person) return { ...value, people: value.people.filter((_, i) => i !== index) };
      const clean = { ...person, phone: person.phone.replace(/\D/g, "").length >= 10 ? prettyPhone(person.phone) : person.phone };
      if (index < 0) return { ...value, people: [...value.people, clean] };
      return { ...value, people: value.people.map((row, i) => (i === index ? clean : row)) };
    });
    setEditing(null);
    setSheet(null);
  }

  /** Each tap opens Messages with that person's own link; we count it as sent and log it. */
  function markInviteSent(invite: SignupInvite) {
    setSentKeys((keys) => {
      if (keys.includes(invite.key)) return keys;
      const next = [...keys, invite.key];
      setState((value) => ({ ...value, invitesSent: next.length }));
      return next;
    });
    void recordInvitesSent({ names: [`${invite.firstName} ${invite.lastName}`.trim()] }).catch(() => undefined);
  }

  function pickSize(size: SignupState["size"]) {
    const next = { ...state, size };
    setState(next);
    window.setTimeout(() => setStep(nextStepKey("size", next)), 180);
  }

  function goNext() {
    if (step === "welcome") return setStep("you");
    if (step === "trial") return trialNext();
    if (step === "done") return setSheet("job");
    const issue = stepProblem(step, state);
    if (issue) {
      setProblem(issue);
      return;
    }
    setStep(nextStepKey(step, state));
  }

  function skip() {
    if (!canSkip(step)) return;
    setStep(nextStepKey(step, state));
  }

  function goBack() {
    if (step === "welcome" || step === "done") return;
    setStep(prevStepKey(step, state));
  }

  /** Footer button on "Free for 14 days", by card phase. */
  function trialNext() {
    if (card.phase === "checking" || pending) return;
    if (card.phase === "ok") return finish();
    if (card.phase === "blocked") return subscribeNow();
    if (card.phase === "declined") {
      setCard({ phase: "enter" });
      cardEntry.current?.reset();
      return;
    }
    const issue = stepProblem("trial", state);
    if (issue) {
      setProblem(issue);
      return;
    }
    setProblem("");
    cardEntry.current?.start();
  }

  /** Blocked repeat trial: save the setup (no trial), then Subscribe $199/mo with no free days. */
  function subscribeNow() {
    if (landing) {
      startTransition(async () => {
        const checkout = await startBillingCheckout("base").catch(() => null);
        if (checkout?.url) window.location.href = checkout.url;
        else setProblem("Couldn’t open checkout. Try Office › Billing.");
      });
      return;
    }
    finish(true);
  }

  function finish(subscribe = false) {
    const issue = stepProblem("trial", state);
    if (issue) {
      setProblem(issue);
      return;
    }
    // You and Trade are the only must-haves; send them back there if they slipped past.
    for (const key of ["you", "trade"] as const) {
      const gap = stepProblem(key, state);
      if (gap) {
        setStep(key);
        toast.error(gap);
        return;
      }
    }
    const weekday = new Date(`${settings.periodAnchor}T00:00:00Z`).getUTCDay();
    const payload = buildSignupPayload(state, {
      pay: {
        frequency: settings.payFrequency,
        periodStart: snapToWeekday(mostRecentWeekday(weekday, today), weekday),
      },
      // Go-public B4: no made-up (312) 555 line. The real number comes from AI answering setup.
      answeringLine: "",
      shellTheme: settings.setupComplete ? settings.shellTheme : state.shellTheme || DEFAULT_SHELL_THEME,
      shellInk: settings.setupComplete ? settings.shellInk : "",
      logoUrl: settings.logoUrl,
    });
    startTransition(async () => {
      try {
        const response = await fetch("/api/setup/finish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            cardCheckToken: card.phase === "ok" || card.phase === "blocked" ? card.token : "",
            deviceId: readDeviceId(),
          }),
        });
        const result = (await response.json().catch(() => ({}))) as Partial<Landing> & {
          error?: string;
          cardCheck?: boolean;
          trialBlocked?: { reason: string; title: string; line: string; subscribe: string } | null;
        };
        if (response.status === 428 || result.cardCheck) {
          // The check expired or was never run: back to the card box.
          setCard({ phase: "enter" });
          setProblem(result.error || "Check your card first.");
          return;
        }
        if (!response.ok || !result.href || !result.route) {
          setProblem(result.error || "Couldn’t finish setup. Try again.");
          return;
        }
        const next: Landing = { href: result.href, route: result.route, verified: result.verified, invites: result.invites || [] };
        setLanding(next);
        if (result.trialBlocked) {
          // Setup is saved; no free trial for this card/shop. Straight to Subscribe (no trial days).
          const shown = card.phase === "ok" || card.phase === "blocked" ? card : { brand: "Card", last4: "" };
          setCard({ phase: "blocked", token: "", brand: shown.brand, last4: shown.last4, ...result.trialBlocked });
          if (subscribe) {
            const checkout = await startBillingCheckout("base").catch(() => null);
            if (checkout?.url) window.location.href = checkout.url;
            else setProblem("Setup is saved. Open Office › Billing to subscribe.");
          }
          return;
        }
        if (next.invites?.length) setSheet("invites");
        if (result.route === "billing") {
          toast.message("You’re in. Stripe hasn’t confirmed the trial yet — check Office › Billing when you get a minute.");
        }
        setStep("done");
      } catch (error) {
        setProblem(error instanceof Error ? error.message : "Couldn’t finish setup. Try again.");
      }
    });
  }

  const termsAccepted = state.terms;
  const crewNamed = state.people.filter((person) => person.firstName.trim());
  const showSkip = canSkip(step);
  const fill = sectionFill(step);
  const atSection = sectionIndex(step);

  return (
    <section
      className={cx(s.root, barlowCondensed.variable, barlowSemi.variable, "signup-v2")}
      data-signup-step={step}
      data-signup-trade={state.trade || "none"}
    >
      <div className={s.frame}>
        <div className={s.scroll} ref={scrollRef}>
          {step === "welcome" ? (
            <Welcome onStart={() => setStep("you")} />
          ) : (
            <>
              <header className={s.hdr} data-setup-brand="1">
                {step !== "done" && step !== "you" && !(step === "trial" && card.phase === "checking") ? (
                  <button type="button" className={s.back} aria-label="Back" onClick={goBack}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M15 5l-7 7 7 7" />
                    </svg>
                  </button>
                ) : (
                  <span />
                )}
                <div className={s.brand}>
                  <img className={s.sh} src="/brand/jc-shield@2x.webp" alt="" width={68} height={68} />
                </div>
                <div className={s.left}>{timeLeft(step)}</div>
              </header>
              <div className={s.prog} role="progressbar" aria-valuemin={0} aria-valuemax={5} aria-valuenow={Math.max(0, atSection)}>
                {SECTIONS.map((section, index) => (
                  <div
                    key={section.key}
                    className={cx(index < atSection && s.done, index === atSection && s.cur)}
                    style={{ ["--w" as string]: `${Math.round(fill * 100)}%` }}
                  >
                    <i />
                    <span>
                      {index < atSection ? "✓ " : ""}
                      {section.label}
                    </span>
                  </div>
                ))}
              </div>
              {step !== "done" && !(step === "trial" && card.phase !== "enter") ? (
                <>
                  <div className={s.kick}>{current.kick}</div>
                  <h1 className={s.q}>{current.title}</h1>
                  {step === "trial" ? (
                    CARD_CHECK_CONNECTED ? (
                      <p className={s.help} data-hold-copy="1">
                        We’ll put a <b>$1 hold</b> on your card to make sure it works, then release it right away. You won’t be
                        charged until your free trial ends on <b>{addDays(today, 30)}</b>.
                      </p>
                    ) : (
                      <p className={s.help} data-hold-copy="0">
                        {CARD_NOT_CONNECTED_LINE} Your free trial runs until <b>{addDays(today, 30)}</b>.
                      </p>
                    )
                  ) : helpFor(step, profile.who) ? (
                    <p className={s.help}>{helpFor(step, profile.who)}</p>
                  ) : null}
                </>
              ) : null}

              {step === "you" ? (
                <div>
                  <div className={s.fillRow}>
                    <button type="button" className={s.fillBtn} data-fill="apple" onClick={() => void fillFrom("apple")}>
                      <svg viewBox="0 0 24 24" aria-hidden="true" className={s.fillApple}>
                        <path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.6s-2.5-1-2.5-3.8zM14.1 5.8c.6-.8 1.1-1.8 1-2.8-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.7-1 2.7 1 .1 2-.5 2.7-1.3z" />
                      </svg>
                      Fill from Apple
                    </button>
                    <button type="button" className={s.fillBtn} data-fill="google" onClick={() => void fillFrom("google")}>
                      <svg viewBox="0 0 24 24" aria-hidden="true" className={s.fillGoogle}>
                        <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" />
                        <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
                        <path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14z" />
                        <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6z" />
                      </svg>
                      Fill from Google
                    </button>
                  </div>
                  <div className={s.row2}>
                    <label className={s.f}>
                      <span className={s.lab}>First name</span>
                      <input
                        ref={firstNameRef}
                        className={s.in}
                        value={state.firstName}
                        autoComplete="given-name"
                        autoCapitalize="words"
                        name="signup-first-name"
                        onChange={(event) => patch({ firstName: event.target.value })}
                      />
                    </label>
                    <label className={s.f}>
                      <span className={s.lab}>Last name</span>
                      <input
                        className={s.in}
                        value={state.lastName}
                        autoComplete="family-name"
                        autoCapitalize="words"
                        name="signup-last-name"
                        onChange={(event) => patch({ lastName: event.target.value })}
                      />
                    </label>
                  </div>
                  <label className={cx(s.f, s.okWrap)}>
                    <span className={s.lab}>Your cell phone</span>
                    {state.cell.replace(/\D/g, "").length >= 10 ? <span className={s.okDot} aria-label="Looks good" data-phone-ok="1" /> : null}
                    <input
                      className={s.in}
                      value={state.cell}
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      name="signup-cell"
                      onChange={(event) => patch({ cell: event.target.value })}
                      onBlur={() => state.cell.replace(/\D/g, "").length >= 10 && patch({ cell: prettyPhone(state.cell) })}
                    />
                  </label>
                  {/* Go-public B1: the office PIN is always picked here (never the end of the cell). */}
                  <label className={s.f}>
                    <span className={s.lab}>
                      Office PIN <em>4 to 6 numbers you pick</em>
                    </span>
                    <input
                      className={s.in}
                      value={state.pin}
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={6}
                      name="signup-pin"
                      data-voice-label="Office PIN"
                      onChange={(event) => patch({ pin: event.target.value.replace(/\D/g, "").slice(0, 6) })}
                    />
                  </label>
                  <div className={s.hint}>
                    {pinFor(state) ? (
                      <>
                        Office PIN: <b>{pinFor(state)}</b>. Not 0000 or 1234, and not the end of a phone number.
                      </>
                    ) : (
                      <>You type it to open the app. Not 0000 or 1234, and not the end of a phone number.</>
                    )}
                  </div>
                  <label className={s.f}>
                    <span className={s.lab}>
                      Email <em>for receipts</em>
                    </span>
                    <input
                      className={s.in}
                      value={state.email}
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      name="signup-email"
                      onChange={(event) => patch({ email: event.target.value })}
                    />
                  </label>
                </div>
              ) : null}

              {step === "trade" && !scrolledTrades ? (
                <div className={s.scrollcue} aria-hidden="true">
                  ▾ 15 trades + other · scroll ▾
                </div>
              ) : null}
              {step === "trade" ? (
                <div data-trade-grid="1">
                  <div className={s.tg}>
                    {pickerProfiles().map((item) => {
                      const selected = state.trade === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-pressed={selected}
                          className={cx(s.tt, item.id === "Remodeling" && s.wide, selected && s.on, selected && s.tick)}
                          onClick={() => setState((value) => withTrade(value, item.id))}
                        >
                          <SignupIcon name={item.icon} />
                          <span>
                            <b>{item.label}</b>
                            {item.sub ? <small>{item.sub}</small> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    aria-pressed={state.trade === "Other"}
                    className={cx(s.other, state.trade === "Other" && s.on)}
                    onClick={() => setState((value) => withTrade(value, "Other"))}
                  >
                    <SignupIcon name="Other" />
                    <span>
                      <b>{otherProfile().label}</b>
                      <small>{otherProfile().sub}</small>
                    </span>
                  </button>
                  {state.trade === "Other" ? (
                    <label className={s.f}>
                      <span className={s.lab}>Your trade</span>
                      <input
                        className={s.in}
                        value={state.tradeOther}
                        autoCapitalize="words"
                        name="signup-trade-other"
                        autoFocus
                        onChange={(event) => patch({ tradeOther: event.target.value })}
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}

              {step === "services" ? (
                <div>
                  <div className={s.trade}>
                    <div className={s.tl}>
                      <SignupIcon name={profile.icon} />
                      <div>
                        <b>{tradeName(state)}</b>
                        <small>Your trade</small>
                      </div>
                    </div>
                    <button type="button" className={s.chg} onClick={() => setStep("trade")}>
                      Change
                    </button>
                  </div>
                  <div className={s.lab} style={{ marginTop: 18 }}>
                    Jobs you take <em>pick all</em>
                  </div>
                  <div className={s.tiles}>
                    {profile.services.map((tile) => {
                      const selected = state.services.includes(tile.id);
                      return (
                        <button
                          key={tile.id}
                          type="button"
                          aria-pressed={selected}
                          className={cx(s.tile, selected && s.on, selected && s.tick)}
                          onClick={() =>
                            patch({
                              services: selected
                                ? state.services.filter((id) => id !== tile.id)
                                : [...state.services, tile.id],
                            })
                          }
                        >
                          <SignupIcon name={tile.icon} />
                          <span>{tile.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className={s.hint} style={{ marginTop: 12 }}>
                    These build your estimate line items. Add more anytime.
                  </div>
                </div>
              ) : null}

              {step === "company" ? (
                <div>
                  <label className={s.f}>
                    <span className={s.lab}>Company name</span>
                    <input
                      className={s.in}
                      value={state.companyName}
                      autoComplete="organization"
                      autoCapitalize="words"
                      name="signup-company"
                      onChange={(event) => patch({ companyName: event.target.value })}
                    />
                  </label>
                  <label className={s.f}>
                    <span className={s.lab}>Company logo (optional)</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className={s.in}
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const form = new FormData();
                        form.append("file", file);
                        try {
                          const res = await fetch("/api/upload/logo", { method: "POST", body: form });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error || "Upload failed.");
                          patch({ logoUrl: data.logoUrl });
                        } catch (error) {
                          alert(error instanceof Error ? error.message : "Could not upload logo.");
                        }
                      }}
                    />
                    {state.logoUrl ? <small className={s.hint}>Logo uploaded ✓</small> : null}
                  </label>
                  <div className={s.f}>
                    <span className={s.lab}>App skin</span>
                    <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                      {[
                        { id: "midnight", label: "Teal", bg: "#0f3d3e" },
                        { id: "light", label: "White", bg: "#ffffff" },
                        { id: "ink", label: "Black", bg: "#0a0a0a" },
                      ].map((skin) => {
                        const active = (state.shellTheme || "midnight") === skin.id;
                        return (
                          <button
                            key={skin.id}
                            type="button"
                            onClick={() => patch({ shellTheme: skin.id })}
                            style={{
                              width: 72,
                              height: 72,
                              borderRadius: 12,
                              background: skin.bg,
                              border: active ? "3px solid #a3e635" : "2px solid #d4d4d8",
                              boxShadow: active ? "0 0 12px rgba(163, 230, 53, 0.6)" : "none",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "flex-end",
                              justifyContent: "center",
                              paddingBottom: 6,
                              color: skin.id === "light" ? "#000" : "#fff",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            {skin.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <label className={s.f}>
                    <span className={s.lab}>Shop address</span>
                    <input
                      className={s.in}
                      value={state.address}
                      autoComplete="street-address"
                      autoCapitalize="words"
                      name="signup-address"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-controls="signup-address-list"
                      aria-expanded={addrHits.length > 0}
                      onFocus={() => setAddrFocus(true)}
                      onBlur={() => window.setTimeout(() => setAddrFocus(false), 200)}
                      onChange={(event) => patch({ address: event.target.value })}
                    />
                  </label>
                  {addrHits.length ? (
                    <div className={s.sugg} id="signup-address-list" role="listbox" aria-label="Address suggestions" data-address-suggestions="1">
                      <div className={s.suggHead}>
                        <SignupIcon name="pin" />
                        Tap your address
                      </div>
                      {addrHits.map((hit, index) => (
                        <button
                          key={hit.full}
                          type="button"
                          role="option"
                          aria-selected={index === 0}
                          className={cx(s.suggRow, index === 0 && s.suggTop)}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            addrPicked.current = hit.full;
                            setAddrHits([]);
                            patch({ address: hit.full });
                          }}
                        >
                          <SignupIcon name="pin" />
                          <span>
                            <b>{hit.line1}</b>
                            {hit.line2 ? <small>{hit.line2}</small> : null}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <label className={s.f}>
                    <span className={s.lab}>
                      Company phone <em>if it’s not your cell</em>
                    </span>
                    <input
                      className={s.in}
                      value={state.companyPhone}
                      type="tel"
                      inputMode="tel"
                      autoComplete="off"
                      name="signup-company-phone"
                      onChange={(event) => patch({ companyPhone: event.target.value })}
                    />
                  </label>
                  {!state.companyPhone.trim() && state.cell.trim() ? (
                    <div className={s.hint}>Blank = customers see your cell, {state.cell}.</div>
                  ) : null}
                </div>
              ) : null}

              {step === "area" ? (
                <div>
                  <AreaMap town={townFrom(state.address)} radius={state.radius} />
                  <div className={s.lab} style={{ marginTop: 16 }}>
                    How far you’ll drive
                  </div>
                  <div className={s.chips} style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                    {RADIUS_CHOICES.map((miles) => (
                      <button
                        key={miles}
                        type="button"
                        aria-pressed={state.radius === miles}
                        className={cx(s.chip, state.radius === miles && s.sel)}
                        onClick={() => patch({ radius: miles })}
                      >
                        {miles === 75 ? "75+" : miles} mi
                      </button>
                    ))}
                  </div>
                  <div className={s.lab} style={{ marginTop: 16 }}>
                    Work days
                  </div>
                  <div className={s.chips} style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                    {WORK_DAYS.map((days) => (
                      <button
                        key={days.id}
                        type="button"
                        aria-pressed={state.workDays === days.id}
                        className={cx(s.chip, state.workDays === days.id && s.sel)}
                        onClick={() => patch({ workDays: days.id })}
                      >
                        {days.label}
                      </button>
                    ))}
                  </div>
                  <div className={s.lab} style={{ marginTop: 16 }}>
                    Hours
                  </div>
                  <div className={s.hrs}>
                    <ClockBox label="Start time" value={state.workStart} onChange={(value) => patch({ workStart: value })} />
                    <span>to</span>
                    <ClockBox label="Quit time" value={state.workEnd} onChange={(value) => patch({ workEnd: value })} />
                  </div>
                </div>
              ) : null}

              {step === "size" ? (
                <div style={{ marginTop: 8 }}>
                  {SIZES.map((item) => {
                    const selected = state.size === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={selected}
                        className={cx(s.tile, s.big, selected && s.on, selected && s.tick)}
                        onClick={() => pickSize(item.id)}
                      >
                        <SignupIcon name={item.icon} />
                        <span>
                          {item.label}
                          <small>{item.sub}</small>
                        </span>
                      </button>
                    );
                  })}
                  <div className={s.hint} style={{ marginTop: 14 }}>
                    “Just me” skips the next screen.
                  </div>
                </div>
              ) : null}

              {step === "people" ? (
                <div data-signup-people="1">
                  <button type="button" className={cx(s.ib, s.lit, s.ibWide)} data-contacts-source={contacts} onClick={() => void fromContacts()}>
                    <SignupIcon name="contacts" />
                    <span>From contacts</span>
                  </button>
                  {state.people.length ? (
                    <div className={s.lab} style={{ marginTop: 16 }}>
                      Added · {state.people.filter((person) => person.firstName.trim()).length} <em>Boss = sees money</em>
                    </div>
                  ) : null}
                  {state.people.map((person, index) => (
                    <div key={`person-${index}`} className={s.pp} data-person-row="1">
                      <button type="button" className={s.ppMain} aria-label={`Edit ${person.firstName || "this person"}`} onClick={() => openPerson(index)}>
                        {person.photo ? (
                          <img className={s.av} src={person.photo} alt="" width={46} height={46} />
                        ) : (
                          <span className={cx(s.av, s.avInit)} aria-hidden="true">
                            {initials(person)}
                          </span>
                        )}
                        <span className={s.pn}>
                          <b>{`${person.firstName} ${person.lastName}`.trim() || "Name?"}</b>
                          <small>{person.phone || "Add a phone"}</small>
                        </span>
                      </button>
                      <div className={s.seg} role="group" aria-label={`${person.firstName || "Person"}: crew or boss`}>
                        {(["crew", "boss"] as const).map((role) => (
                          <button
                            key={role}
                            type="button"
                            aria-pressed={person.role === role}
                            className={cx(person.role === role && s.segOn)}
                            onClick={() => editPerson(index, { role })}
                          >
                            {role}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button type="button" className={s.addone} onClick={() => openPerson(-1)}>
                    ＋ Add one by name &amp; phone
                  </button>
                  <div className={s.hint} style={{ marginTop: 8 }}>
                    Pay rates come later, on their first timesheet.
                  </div>
                </div>
              ) : null}

              {step === "methods" ? (
                <div>
                  {[
                    { key: "acceptCard" as const, icon: "card", label: "Card", sub: "Customer taps Pay on the invoice. Money hits your bank in ~2 days." },
                    { key: "acceptCash" as const, icon: "cash", label: "Cash or check", sub: "Mark it paid with one tap." },
                    { key: "acceptAch" as const, icon: "bank", label: "Bank transfer (ACH)", sub: "Lower fees on big jobs." },
                  ].map((method) => {
                    const selected = state[method.key];
                    return (
                      <button
                        key={method.key}
                        type="button"
                        aria-pressed={selected}
                        className={cx(s.pm, selected && s.on)}
                        onClick={() => patch({ [method.key]: !selected } as Partial<SignupState>)}
                      >
                        <SignupIcon name={method.icon} />
                        <span>
                          <b>{method.label}</b>
                          <small>{method.sub}</small>
                        </span>
                        <span className={s.cb} />
                      </button>
                    );
                  })}
                  <div className={s.note}>
                    <SignupIcon name="info" />
                    <div>
                      <b>No bank needed today.</b> We’ll link it when you send your first invoice.
                    </div>
                  </div>
                </div>
              ) : null}

              {step === "estimate" ? (
                <EstimateNumbers state={state} onChange={(estimate) => patch({ estimate })} />
              ) : null}

              {step === "trial" ? (
                <div data-signup-trial="1" data-card-phase={card.phase}>
                  {card.phase === "checking" ? <CardChecking phase={card} /> : null}
                  {card.phase === "ok" ? <CardOk phase={card} freeUntil={addDays(today, 30)} price={planPrice().replace("/mo", " a month")} /> : null}
                  {card.phase === "declined" ? <CardDeclined phase={card} /> : null}
                  {card.phase === "blocked" ? <CardBlocked phase={card} helpHref={trialHelpHref()} /> : null}
                  {/* Stays mounted (hidden) so "Fix this card" keeps what was typed. */}
                  <div hidden={card.phase !== "enter"}>
                    <div className={cx(s.card, s.tlc)}>
                      {[
                        {
                          when: "Today",
                          date: addDays(today, 0),
                          text: CARD_CHECK_CONNECTED ? "$1 card check, returned right away." : "No card needed yet. Nothing charged.",
                          now: true,
                        },
                        { when: "Day 30", date: addDays(today, 30), text: `${planPrice().replace("/mo", " a month")} starts. Cancel anytime.`, now: false },
                      ].map((row) => (
                        <div key={row.when} className={cx(s.tn, row.now && s.now)}>
                          <div className={s.dot} />
                          <div>
                            <b>
                              {row.when} <span>· {row.date}</span>
                            </b>
                            <small>{row.text}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                    <CardEntry
                      ref={cardEntry}
                      onPhase={(next) => {
                        setCard(next);
                        if (next.phase === "enter" && next.problem) setProblem(next.problem);
                        else setProblem("");
                      }}
                      onReady={setCardReady}
                      info={{
                        phone: state.cell,
                        email: state.email,
                        name: `${state.firstName} ${state.lastName}`.trim(),
                        businessName: state.companyName,
                        businessAddress: state.address,
                      }}
                    />
                    <div className={s.addonRow} data-addon-locked="1" aria-label="AI answering line: optional +$59/mo add-on, not in the trial">
                      <span>
                        <b>AI answering line</b>
                        <small>Optional · not in the trial · turn on later</small>
                      </span>
                      <b>+$59/mo</b>
                    </div>
                    <label className={s.agree} data-terms-accept="1">
                      <input
                        type="checkbox"
                        required
                        aria-required="true"
                        checked={termsAccepted}
                        onChange={(event) => patch({ terms: event.target.checked })}
                      />
                      <span className={cx(s.cb, state.terms && s.cbOn)} style={{ marginLeft: 0 }} />
                      <span>
                        I agree to the{" "}
                        <a href="/terms" target="_blank" rel="noreferrer">
                          Terms &amp; Conditions
                        </a>{" "}
                        &amp;{" "}
                        <a href="/privacy" target="_blank" rel="noreferrer">
                          Privacy Policy
                        </a>
                      </span>
                    </label>
                    <p className={s.fine}>
                      {CARD_CHECK_CONNECTED ? "$1 card check, returned right away." : "No card check yet (not connected)."} The plan is {planPrices()} after the 14-day trial and
                      renews each month (or year) until you cancel in Office › Billing. Answering is optional at +$59/mo.
                      Customer card invoices carry a 1% platform fee. One free trial per business.
                    </p>
                  </div>
                </div>
              ) : null}

              {step === "done" ? (
                <div data-signup-done="1">
                  <div className={s.hero}>
                    <div className={s.ring}>
                      <img src="/brand/jc-shield@2x.webp" alt="" width={84} height={84} />
                    </div>
                    <div className={s.badge}>
                      <SignupIcon name="check" />
                    </div>
                  </div>
                  <h1 className={cx(s.q, s.dn, s.center)}>You’re set{state.firstName.trim() ? `, ${state.firstName.trim()}` : ""}.</h1>
                  <p className={cx(s.help, s.center)}>
                    {(state.companyName.trim() || "Your shop") + " is ready to roll."}
                  </p>
                  <ul className={s.sl}>
                    {doneSummary(state).map((line, index) => (
                      <li key={line} data-invites-line={index === 2 ? "1" : undefined}>
                        <SignupIcon name="check" />
                        <span>
                          {line}
                          {/* Merge: mockup headline ("3 invites sent") with the built list of who under it. */}
                          {index === 2 && crewNamed.length ? (
                            <span className={s.slPeople} data-invite-people="1">
                              {crewNamed
                                .map((person) => `${person.firstName}${sentKeys.includes(inviteKey(person)) ? " ✓" : ""}`)
                                .join(" · ")}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className={cx(s.card, s.gd)} data-guide-first-step="1">
                    <div className={s.gk}>
                      <SignupIcon name="spark" />
                      GUIDE · YOUR FIRST STEP
                    </div>
                    <b>Add your first job</b>
                    <small>Who called? Say or type their name, phone, and what they need.</small>
                  </div>
                  {landing?.invites?.length && sentKeys.length < landing.invites.length ? (
                    <button type="button" className={s.later} data-text-invites="1" onClick={() => setSheet("invites")}>
                      Text {landing.invites.length - sentKeys.length} invite{landing.invites.length - sentKeys.length === 1 ? "" : "s"} now
                    </button>
                  ) : null}
                  <button type="button" className={s.later} onClick={() => setSheet("later")}>
                    {laterItems(state, settings.shop?.laterDone).length} things to finish later — we’ll ask when you need them
                  </button>
                </div>
              ) : null}

              {problem ? (
                <div className={s.err} role="alert">
                  {problem}
                </div>
              ) : null}
            </>
          )}
        </div>

        {step === "you" && tipOpen ? (
          <div className={s.tip} role="note" data-mic-tip="1">
            <button type="button" className={s.tipX} aria-label="Close tip" onClick={closeTip}>
              ✕
            </button>
            Tap a box, then <b>hold the mic</b> and just say it. It types for you.
          </div>
        ) : null}
        <div className={s.foot}>
          {step === "welcome" ? (
            <>
              <div className={cx(s.frow, s.withMic)}>
                <button type="button" className={cx(s.next, s.go)} onClick={goNext}>
                  Get started {ARROW}
                </button>
              </div>
              <div className={s.trialStrip} data-welcome-strip="1">
                <span>30 DAYS FREE</span>
                <i />
                <span>~2 MIN SETUP</span>
              </div>
              <div className={cx(s.trialStrip, s.trialStrip2)}>{CARD_CHECK_CONNECTED ? "$1 CARD CHECK, RETURNED RIGHT AWAY" : "NO CARD NEEDED TODAY"}</div>
              <button type="button" className={s.signin} onClick={() => setSheet("signin")}>
                Already have an account? <b>Sign in</b>
              </button>
              <div className={s.crewnote}>On a crew? Open the invite link your boss texted you.</div>
            </>
          ) : (
            <>
              {showSkip ? (
                <button type="button" className={s.skip} onClick={skip}>
                  {skipLabel(step)}
                </button>
              ) : step === "done" ? (
                <button type="button" className={s.skip} onClick={() => onDone?.(landing || undefined)}>
                  Look around first
                </button>
              ) : null}
              <div className={cx(s.frow, s.withMic)}>
                <button
                  type="button"
                  className={cx(s.next, step === "trial" && card.phase === "checking" && s.nextBusy)}
                  disabled={
                    pending ||
                    (step === "trial" && card.phase === "checking") ||
                    (step === "trial" && card.phase === "enter" && (!termsAccepted || !cardReady))
                  }
                  onClick={goNext}
                  data-trial-button={step === "trial" ? card.phase : undefined}
                >
                  {step === "trial" ? trialButton(card, pending) : pending ? "Setting up…" : step === "you" && prefilled ? "Looks right" : nextLabel(step, state)}{" "}
                  {pending || (step === "trial" && card.phase === "checking") ? null : ARROW}
                </button>
              </div>
              {step === "trial" ? (
                card.phase === "declined" ? (
                  <div className={s.footLinks}>
                    <button type="button" className={s.linkish} onClick={() => setCard({ phase: "enter" })} data-fix-card="1">
                      Fix this card
                    </button>
                    <button type="button" className={s.linkish} onClick={() => setCard({ phase: "enter" })}>
                      Use Apple Pay
                    </button>
                  </div>
                ) : card.phase === "blocked" ? (
                  <div className={s.footLinks}>
                    <button
                      type="button"
                      className={s.linkish}
                      onClick={() => {
                        setCard({ phase: "enter" });
                        cardEntry.current?.reset();
                      }}
                      data-other-card="1"
                    >
                      Use a different card
                    </button>
                  </div>
                ) : (
                  <p className={s.footFine} data-trial-foot="1">
                    {card.phase === "checking"
                      ? "Nothing is charged today."
                      : card.phase === "ok" && card.last4
                        ? "Some banks show the $1 as “pending” for a day. It drops off on its own."
                        : `Auto-renews at ${planPrice()} after ${addDays(today, 30)} until you cancel.`}
                  </p>
                )
              ) : null}
            </>
          )}
        </div>
      </div>

      {sheet === "person" && editing ? (
        <PersonSheet
          key={editing.index}
          initial={editing.person}
          isNew={editing.index < 0}
          onSave={savePerson}
          onClose={() => {
            setEditing(null);
            setSheet(null);
          }}
        />
      ) : null}

      {sheet === "invites" && landing?.invites?.length ? (
        <Sheet noMic onClose={() => setSheet(null)}>
          <div className={s.kick} style={{ marginTop: 6 }}>
            Your crew · invites
          </div>
          <h2 className={s.q} style={{ fontSize: 33 }}>
            Text their sign-in links
          </h2>
          <p className={s.help} style={{ fontSize: 17 }}>
            Each tap opens Messages with that person’s own link. Just hit send.
          </p>
          <div data-invite-list="1">
            {landing.invites.map((invite) => {
              const body = inviteText({
                firstName: invite.firstName,
                shop: state.companyName,
                owner: state.firstName,
                url: invite.url,
                role: invite.role,
              });
              const sent = sentKeys.includes(invite.key);
              return (
                <div key={invite.key} className={s.inv} data-invite-sent={sent ? "1" : "0"}>
                  <span className={cx(s.av, s.avInit)} aria-hidden="true">
                    {initials(invite)}
                  </span>
                  <span className={s.pn}>
                    <b>{`${invite.firstName} ${invite.lastName}`.trim()}</b>
                    <small>{sent ? "Sent ✓" : invite.role === "boss" ? "Boss · app link + office PIN" : "Crew · own sign-in link"}</small>
                  </span>
                  {invite.phone ? (
                    <a
                      className={cx(s.invText, sent && s.invDone)}
                      href={inviteSmsHref(invite.phone, body, typeof navigator === "undefined" ? "" : navigator.userAgent)}
                      onClick={() => markInviteSent(invite)}
                    >
                      {sent ? "Again" : "Text"}
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className={s.invCopy}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(body);
                        toast.success(`Copied ${invite.firstName}’s invite.`);
                        markInviteSent(invite);
                      } catch {
                        toast.error(invite.url);
                      }
                    }}
                  >
                    Copy link
                  </button>
                </div>
              );
            })}
          </div>
          <div className={s.sheetActions}>
            <button type="button" className={s.next} onClick={() => setSheet(null)}>
              Done {ARROW}
            </button>
          </div>
        </Sheet>
      ) : null}

      {sheet === "signin" ? (
        <Sheet noMic onClose={() => setSheet(null)}>
          <div className={s.kick} style={{ marginTop: 6 }}>
            Already have an account?
          </div>
          <h2 className={s.q} style={{ fontSize: 33 }}>
            Sign in to your shop
          </h2>
          <p className={s.help} style={{ fontSize: 17 }}>
            On a crew? Open the invite link your boss texted you. Owner or office? Open your shop’s jobcommand.app address
            and enter your 4-number PIN. This screen is only for setting up a brand-new shop.
          </p>
          <div className={s.sheetActions}>
            <button type="button" className={s.next} onClick={() => setSheet(null)}>
              Got it
            </button>
          </div>
        </Sheet>
      ) : null}

      {sheet === "later" ? (
        <Sheet noMic onClose={() => setSheet(null)}>
          <div className={s.kick} style={{ marginTop: 6 }}>
            Finish later
          </div>
          <h2 className={s.q} style={{ fontSize: 33 }}>
            We’ll ask right when it matters
          </h2>
          <p className={s.help} style={{ fontSize: 17 }}>
            Nothing here blocks you. Each one pops up once, at the moment it’s needed.
          </p>
          <div className={s.lh}>
            <span>What</span>
            <span>When we ask</span>
          </div>
          {laterItems(state, settings.shop?.laterDone).map((item) =>
            item.key === "license" || item.key === "logo" || item.key === "review" ? (
              <button key={item.key} type="button" className={s.lr} onClick={() => setSheet(item.key === "review" ? "review" : "official")}>
                <SignupIcon name={item.icon} />
                <span>
                  <b>{item.label}</b>
                  <small>{item.when}</small>
                </span>
              </button>
            ) : (
              <a key={item.key} className={s.lr} href={item.href || "/?tab=company"}>
                <SignupIcon name={item.icon} />
                <span>
                  <b>{item.label}</b>
                  <small>{item.when}</small>
                </span>
              </a>
            )
          )}
          <div className={s.sheetActions}>
            <button type="button" className={s.next} onClick={() => setSheet(null)}>
              Got it
            </button>
          </div>
        </Sheet>
      ) : null}

      {sheet === "official" ? (
        <OfficialSheet
          mode="later"
          seed={{ licenseLabel: profile.later.find((item) => item.key === "license")?.label || "License #", logoUrl: settings.logoUrl }}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {sheet === "review" ? <ReviewSheet initial={settings.shop?.reviewLink || ""} onClose={() => setSheet(null)} /> : null}

      {sheet === "job" ? (
        <FirstJobSheet
          actor={`${state.firstName} ${state.lastName}`.trim() || "Owner"}
          leadNoun={profile.id === "Painting" ? "What do they want painted?" : "What do they need?"}
          onSkip={() => onDone?.(landing || undefined)}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </section>
  );

  function editPerson(index: number, next: Partial<SignupPerson>) {
    setState((value) => ({
      ...value,
      people: value.people.map((person, i) => (i === index ? { ...person, ...next } : person)),
    }));
  }
}

function helpFor(step: SignupStepKey, who: string) {
  if (step === "estimate") return `Common for ${who}. Fix any I got wrong.`;
  return SIGNUP_STEPS[stepIndex(step)].help;
}

function talkExamples(step: SignupStepKey) {
  switch (step) {
    case "you":
      return ["Eric Stlawrence, 501 555 0142, eric@topgunpainting.com"];
    case "trade":
      return ["We’re electricians", "Roofing"];
    case "company":
      return ["Top Gun Painting at 118 Central Ave, Hot Springs"];
    case "people":
      return ["Riley Nash 501 555 0188, Sam Ellis 501 555 0123"];
    default:
      return undefined;
  }
}

function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <div className={s.wel}>
      <div className={s.glow} />
      <img className={s.lock} src="/brand/jc-shield@2x.webp" alt="jobcommand.app" width={624} height={524} decoding="async" />
      <h1 className={s.wh}>
        Run the whole shop
        <br />
        from the truck.
      </h1>
      <ul className={s.vals}>
        <li>
          <SignupIcon name="mic" />
          Talk it. The co-pilot drafts the bid.
        </li>
        <li>
          <SignupIcon name="users" />
          Crew, schedule &amp; route
        </li>
        <li>
          <SignupIcon name="book" />
          Invoices, payroll &amp; CPA packets
        </li>
      </ul>
      <button type="button" className={s.welcomeCta} data-welcome-cta="1" onClick={onStart}>
        Sign Up
      </button>
    </div>
  );
}

/** Mockup "7:00 AM" box with a clock icon; the phone's own time picker opens on tap. */
function ClockBox({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className={s.clock}>
      <SignupIcon name="clock" />
      <b>{formatClock(value)}</b>
      <input type="time" value={value} aria-label={label} data-voice="off" onChange={(event) => event.target.value && onChange(event.target.value)} />
    </label>
  );
}

function AreaMap({ town, radius }: { town: string; radius: number }) {
  const r = 30 + Math.min(radius, 75) * 0.75;
  return (
    <div className={s.map} aria-hidden="true">
      <svg viewBox="0 0 350 128" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="signup-rg">
            <stop offset="0" stopColor="#b2ff00" stopOpacity=".22" />
            <stop offset="1" stopColor="#b2ff00" stopOpacity=".05" />
          </radialGradient>
        </defs>
        <rect width="350" height="128" fill="#101210" />
        <path d="M0 30 Q90 50 160 20 T350 40" stroke="#2a2f26" strokeWidth="5" fill="none" />
        <path d="M40 128 Q110 80 175 64 T330 0" stroke="#2a2f26" strokeWidth="4" fill="none" />
        <path d="M0 95 Q120 100 200 90 T350 110" stroke="#232821" strokeWidth="3" fill="none" />
        <path d="M120 0 L150 128" stroke="#232821" strokeWidth="3" />
        <path d="M230 0 Q215 70 250 128" stroke="#232821" strokeWidth="3" fill="none" />
        <circle cx="175" cy="64" r={r} fill="url(#signup-rg)" stroke="#b2ff00" strokeWidth="2" strokeDasharray="6 5" />
        <circle cx="175" cy="64" r="7" fill="#b2ff00" />
        <circle cx="175" cy="64" r="13" fill="none" stroke="#b2ff00" strokeOpacity=".4" strokeWidth="2" />
      </svg>
      <div className={s.mlab}>
        <SignupIcon name="pin" />
        {town || "Your shop"}
      </div>
      <div className={s.mr}>{radius === 75 ? "75+" : radius} MI</div>
    </div>
  );
}

function EstimateNumbers({ state, onChange }: { state: SignupState; onChange: (next: SignupState["estimate"]) => void }) {
  const profile = profileFor(state);
  const est = state.estimate;
  const rate = profile.estimate.rate;
  const set = (next: Partial<SignupState["estimate"]>) => onChange({ ...est, ...next });
  const num = (value: string) => {
    const n = Number(value.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const [open, setOpen] = useState("");
  // Mockup rows: label · gold value · arrow. Tap a row to change it right there.
  const choice = profile.estimate.choice;
  const rows: { key: string; label: string; shown: string; value: number; step: number; unit: string; set: (n: number) => void }[] = [
    // Merge: the built license choice (Master / Journeyman / Residential …) is one more arrow row.
    ...(choice
      ? [{ key: "choice", label: choice.label, shown: choice.options.find((option) => option.value === est.choice)?.label || "Pick one", value: 0, step: 0, unit: "", set: () => undefined }]
      : []),
    ...profile.estimate.extras.map((extra) => {
      const value = Number(est.extras[extra.key] ?? extra.value);
      return {
        key: extra.key,
        label: extra.label,
        shown: formatExtra(extra.kind, value, extra.suffix),
        value,
        step: extra.kind === "money" ? 5 : extra.kind === "mult" ? 0.1 : 1,
        unit: extra.kind === "money" ? `$${extra.suffix || ""}` : extra.kind === "pct" ? "%" : extra.kind === "mult" ? "×" : extra.suffix || "",
        set: (n: number) => set({ extras: { ...est.extras, [extra.key]: n } }),
      };
    }),
    { key: "markup", label: profile.estimate.markupLabel, shown: `${est.markup}%`, value: est.markup, step: 5, unit: "%", set: (n: number) => set({ markup: Math.round(n) }) },
    { key: "valid", label: "Estimates good for", shown: `${est.validDays} days`, value: est.validDays, step: 5, unit: "days", set: (n: number) => set({ validDays: Math.round(n) }) },
  ];
  return (
    <div data-estimate-trade={profile.id}>
      <div className={s.lab} style={{ marginTop: 16 }}>
        {rate.label}
      </div>
      <div className={s.step}>
        <button type="button" className={s.sb} aria-label={`Lower ${rate.label}`} onClick={() => set({ rate: Math.max(0, +(est.rate - rate.step).toFixed(2)) })}>
          −
        </button>
        <div className={s.sv}>
          {rate.prefix ? <span>{rate.prefix}</span> : null}
          <input
            value={String(est.rate)}
            style={{ width: `${Math.max(2, String(est.rate).length) + 0.4}ch` }}
            inputMode="decimal"
            aria-label={rate.label}
            data-voice-label={rate.label}
            onChange={(event) => set({ rate: num(event.target.value) })}
          />
          <small>{rate.unit}</small>
        </div>
        <button type="button" className={s.sb} aria-label={`Raise ${rate.label}`} onClick={() => set({ rate: +(est.rate + rate.step).toFixed(2) })}>
          +
        </button>
      </div>
      <div className={s.lab} style={{ marginTop: 16 }}>
        Deposit to book the job
      </div>
      <div className={s.chips} style={{ gridTemplateColumns: `repeat(${DEPOSIT_CHOICES.length}, 1fr)` }}>
        {DEPOSIT_CHOICES.map((pct) => (
          <button key={pct} type="button" aria-pressed={est.deposit === pct} className={cx(s.chip, est.deposit === pct && s.sel)} onClick={() => set({ deposit: pct })}>
            {pct ? `${pct}%` : "None"}
          </button>
        ))}
      </div>
      <div className={s.rows} data-estimate-rows="1">
        {rows.map((row) => (
          <div key={row.key} className={cx(s.rwWrap, open === row.key && s.rwOpen)}>
            <button type="button" className={s.rw} aria-expanded={open === row.key} onClick={() => setOpen(open === row.key ? "" : row.key)}>
              <span>{row.label}</span>
              <b>{row.shown}</b>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {open === row.key ? (
              row.key === "choice" && choice ? (
                <div className={cx(s.chips, s.rwEdit, s.chipsSmall)} style={{ gridTemplateColumns: `repeat(${choice.options.length <= 4 ? choice.options.length : 3}, 1fr)` }}>
                  {choice.options.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={est.choice === option.value}
                      className={cx(s.chip, est.choice === option.value && s.sel)}
                      onClick={() => {
                        set({ choice: option.value });
                        setOpen("");
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className={cx(s.step, s.rwEdit)}>
                  <button type="button" className={s.sb} aria-label={`Lower ${row.label}`} onClick={() => row.set(Math.max(0, +(row.value - row.step).toFixed(2)))}>
                    −
                  </button>
                  <div className={s.sv}>
                    <input value={String(row.value)} inputMode="decimal" aria-label={row.label} data-voice-label={row.label} onChange={(event) => row.set(num(event.target.value))} />
                    <small>{row.unit}</small>
                  </div>
                  <button type="button" className={s.sb} aria-label={`Raise ${row.label}`} onClick={() => row.set(+(row.value + row.step).toFixed(2))}>
                    +
                  </button>
                </div>
              )
            ) : null}
          </div>
        ))}
      </div>
      <div className={s.hint} style={{ marginTop: 10 }}>
        Starting numbers only — set them to your prices.
      </div>
    </div>
  );
}

/** Add or edit one person: name, phone, Crew / Boss. Also the "From contacts" fallback where no picker exists. */
function PersonSheet({
  initial,
  isNew,
  onSave,
  onClose,
}: {
  initial: SignupPerson;
  isNew: boolean;
  onSave: (person: SignupPerson | null) => void;
  onClose: () => void;
}) {
  const [person, setPerson] = useState<SignupPerson>(initial);
  const set = (next: Partial<SignupPerson>) => setPerson((value) => ({ ...value, ...next }));
  const ready = Boolean(person.firstName.trim());
  return (
    <Sheet onClose={onClose}>
      <div className={s.kick} style={{ marginTop: 6 }}>
        Add your people
      </div>
      <h2 className={s.q} style={{ fontSize: 33 }}>
        {isNew ? "Add one by name & phone" : `Edit ${initial.firstName || "person"}`}
      </h2>
      <div className={s.row2}>
        <label className={s.f}>
          <span className={s.lab}>First name</span>
          <input className={s.in} value={person.firstName} name="person-first" autoCapitalize="words" autoComplete="off" autoFocus={isNew} onChange={(event) => set({ firstName: event.target.value })} />
        </label>
        <label className={s.f}>
          <span className={s.lab}>Last name</span>
          <input className={s.in} value={person.lastName} name="person-last" autoCapitalize="words" autoComplete="off" onChange={(event) => set({ lastName: event.target.value })} />
        </label>
      </div>
      <label className={s.f}>
        <span className={s.lab}>
          Cell phone <em>for their invite text</em>
        </span>
        <input className={s.in} value={person.phone} name="person-phone" type="tel" inputMode="tel" autoComplete="off" onChange={(event) => set({ phone: event.target.value })} />
      </label>
      <div className={s.lab} style={{ marginTop: 16 }}>
        Role <em>Boss = sees money</em>
      </div>
      <div className={s.chips} style={{ gridTemplateColumns: "1fr 1fr" }}>
        {(["crew", "boss"] as const).map((role) => (
          <button key={role} type="button" aria-pressed={person.role === role} className={cx(s.chip, person.role === role && s.sel)} onClick={() => set({ role })}>
            {role === "crew" ? "Crew" : "Boss"}
          </button>
        ))}
      </div>
      <div className={s.sheetActions}>
        <button type="button" className={s.next} disabled={!ready} onClick={() => onSave({ ...person, firstName: person.firstName.trim(), lastName: person.lastName.trim(), phone: person.phone.trim() })}>
          {isNew ? "Add" : "Save"} {ARROW}
        </button>
        {isNew ? (
          <button type="button" className={s.skip} onClick={onClose}>
            Cancel
          </button>
        ) : (
          <button type="button" className={s.skip} onClick={() => onSave(null)}>
            Remove {initial.firstName || "this person"}
          </button>
        )}
      </div>
    </Sheet>
  );
}

/** Google review link (mockup Finish-later item): saved now, texted to the customer after the first paid job. */
function ReviewSheet({ initial, onClose }: { initial: string; onClose: () => void }) {
  const [link, setLink] = useState(initial);
  const [pending, startTransition] = useTransition();
  return (
    <Sheet onClose={onClose} label="Google review link">
      <div className={s.kick} style={{ marginTop: 8 }}>
        First paid job
      </div>
      <h2 className={cx(s.q, s.sheetQ)}>Your Google review link</h2>
      <p className={cx(s.help, s.sheetHelp)}>
        Paste the “Ask for reviews” link from your Google Business Profile (it starts with g.page). We’ll send it after
        the customer pays.
      </p>
      <label className={s.f}>
        <span className={s.lab}>
          Review link <em>optional</em>
        </span>
        <input className={s.in} value={link} name="signup-review-link" inputMode="url" autoComplete="off" onChange={(event) => setLink(event.target.value)} />
      </label>
      <div className={s.sheetActions}>
        <div className={cx(s.frow, s.withMic)}>
          <button
            type="button"
            className={s.next}
            disabled={pending || !link.trim()}
            onClick={() =>
              startTransition(async () => {
                const result = await saveShopExtras({ reviewLink: link, laterDone: ["review"] });
                if (result.ok) toast.success("Saved. We’ll send it after the first paid job.");
                else toast.error("Couldn’t save that. Try again from Office.");
                onClose();
              })
            }
          >
            Save {ARROW}
          </button>
        </div>
        <button type="button" className={s.skip} onClick={onClose}>
          Not now
        </button>
      </div>
    </Sheet>
  );
}

/** Hand-off to the Guide's first step: add the first job (name, phone, what they need). */
function FirstJobSheet({
  actor,
  leadNoun,
  onSkip,
  onClose,
}: {
  actor: string;
  leadNoun: string;
  onSkip: () => void;
  onClose: () => void;
}) {
  const [client, setClient] = useState("");
  const [phone, setPhone] = useState("");
  const [what, setWhat] = useState("");
  const [problem, setProblem] = useState("");
  const [pending, startTransition] = useTransition();
  const ready = useMemo(() => Boolean(client.trim()), [client]);
  return (
    <Sheet onClose={onClose}>
      <div className={s.kick} style={{ marginTop: 8 }}>
        Guide · your first step
      </div>
      <h2 className={s.q} style={{ fontSize: 34 }}>
        Add your first job
      </h2>
      <p className={s.help} style={{ fontSize: 17 }}>
        Who called? Tap a box and say it, or type it.
      </p>
      <label className={s.f}>
        <span className={s.lab}>Customer name</span>
        <input className={s.in} value={client} name="first-job-client" autoCapitalize="words" autoComplete="off" onChange={(event) => setClient(event.target.value)} />
      </label>
      <label className={s.f}>
        <span className={s.lab}>
          Their phone <em>optional</em>
        </span>
        <input className={s.in} value={phone} name="first-job-phone" type="tel" inputMode="tel" autoComplete="off" onChange={(event) => setPhone(event.target.value)} />
      </label>
      <label className={s.f}>
        <span className={s.lab}>{leadNoun}</span>
        <input className={s.in} value={what} name="first-job-what" autoComplete="off" onChange={(event) => setWhat(event.target.value)} />
      </label>
      {problem ? (
        <div className={s.err} role="alert">
          {problem}
        </div>
      ) : null}
      <div className={s.sheetActions}>
        <button
          type="button"
          className={s.next}
          disabled={!ready || pending}
          onClick={() =>
            startTransition(async () => {
              try {
                const name = what.trim() || `${client.trim()} job`;
                const jobId = await createJob({ name: name.slice(0, 80), client: client.trim(), actor });
                if (!jobId) {
                  setProblem("Couldn’t add it — sign in with your PIN and try again.");
                  return;
                }
                if (phone.trim() || what.trim()) {
                  await saveLead({
                    jobId,
                    clientName: client.trim(),
                    phone: phone.trim(),
                    address: "",
                    scopeOfWork: what.trim(),
                    timeline: "",
                    actor,
                  }).catch(() => undefined);
                }
                window.location.assign(`/?job=${encodeURIComponent(jobId)}`);
              } catch (error) {
                setProblem(error instanceof Error ? error.message : "Couldn’t add the job.");
              }
            })
          }
        >
          {pending ? "Adding…" : "Add the job"} {pending ? null : ARROW}
        </button>
        <button type="button" className={s.skip} onClick={onSkip}>
          Look around first
        </button>
      </div>
    </Sheet>
  );
}
