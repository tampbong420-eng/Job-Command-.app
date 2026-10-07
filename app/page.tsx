import { loadWorkspace } from "@/lib/queries";
import { getLiveSession } from "@/lib/live-session";
import { EmployeeWorkspace } from "@/components/command/EmployeeWorkspace";
import { reportServerError } from "@/lib/diagnostics";
import { emptyWorkspace, gateWorkspace } from "@/lib/workspace-fallback";
import type { GatePerson } from "@/lib/types";
import { OneMicProvider } from "@/components/command/OneMic";
import { AiConsentGate } from "@/components/command/AiConsent";
import { DeskHoursScope, type DeskPerson } from "@/components/command/DeskHoursScope";
import { todayString } from "@/lib/dates";
import { cookies } from "next/headers";
import { deviceLookFromCookies } from "@/lib/device-look";
import { DeviceLookProvider } from "@/components/command/DeviceLook";
import { NewShopBar } from "@/components/command/NewShopBar";
import { prismaAllShops } from "@/lib/prisma";
import { SHOP_COOKIE, DEFAULT_SHOP } from "@/lib/shop-scope-core";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: { id?: string; setup?: string; job?: string; tab?: string; stage?: string };
}) {
  try {
    return await renderHome(searchParams);
  } catch (error) {
    // Last resort: if anything in the page throws, log it and render the gate
    // instead of showing a scary error to the user.
    reportServerError(error);
    const workspace = gateWorkspace(emptyWorkspace(null).settings);
    return (
      <EmployeeWorkspace
        employees={[]}
        jobs={[]}
        customers={[]}
        invoices={[]}
        estimates={[]}
        settings={workspace.settings}
        session={null}
        people={[]}
        initialId={searchParams.id}
        initialJob={searchParams.job}
        initialTab={searchParams.tab}
        initialStage={searchParams.stage}
        forceSetup={false}
      />
    );
  }
}

async function renderHome(searchParams: { id?: string; setup?: string; job?: string; tab?: string; stage?: string }) {
  // Live: a deleted shop or a deleted crew login signs every phone out, not just the one that deleted it.
  let session;
  try {
    session = await getLiveSession();
  } catch {
    session = null;
  }
  let workspace;
  try {
    // Eric 2026-10-05: DB hangs from serverless — timeout after 5s and use empty workspace.
    // The app loads, Eric gets in. Data loads when DB is fixed.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("DB timeout")), 5000)
    );
    workspace = await Promise.race([loadWorkspace(session), timeout]);
  } catch (error) {
    reportServerError(error);
    workspace = emptyWorkspace(session);
  }
  if (!session && workspace.settings.setupComplete) {
    // Signed-out phones only get the PIN gate, so only send what the gate draws.
    workspace = gateWorkspace(workspace.settings);
  }
  // Multi-shop B2: a phone that hasn't picked a shop yet (and more than one shop exists) sees a plain jobcommand.app
  // sign-in, never another shop's name or logo. Its first PIN asks "Which shop?" once.
  // Eric 2026-10-05: Skip DB check for hardcoded admin (DB hangs) — single shop, never ask.
  const unknownShop = false;
  if (unknownShop) workspace = { ...workspace, settings: { ...workspace.settings, businessName: "", logoUrl: "" } };
  // Go-public B1: the signed-out gate is PIN-first and never gets the list of names.
  const people: GatePerson[] = [];
  const today = todayString();
  const deskPeople: DeskPerson[] =
    session?.role === "ADMIN"
      ? workspace.employees.map((person) => {
          const entry = person.timeEntries.find((row) => row.date === today) || null;
          return {
            id: person.id,
            firstName: person.firstName,
            lastName: person.lastName,
            today: entry
              ? {
                  id: entry.id,
                  scheduledHours: entry.scheduledHours,
                  jobId: entry.jobId,
                  serviceCodeId: entry.serviceCodeId,
                  scheduledStart: entry.scheduledStart,
                  scheduledEnd: entry.scheduledEnd,
                  notes: entry.notes,
                }
              : null,
          };
        })
      : [];
  return (
    // One floating mic for every screen once someone is signed in (or the owner is in first-run setup).
    // AI permission (App Store 5.1.2(i)): asked once per person per phone before anything goes to the AI.
    // Dark | Light pill: this phone's pick for this person wins over the shop's App look (default Dark).
    <DeviceLookProvider
      accountKey={session?.accountId || null}
      choice={deviceLookFromCookies((name) => cookies().get(name)?.value, session?.accountId)}
    >
    <AiConsentGate accountKey={session?.accountId || "guest"}>
    <OneMicProvider enabled={Boolean(session) || !workspace.settings.setupComplete}>
    <EmployeeWorkspace
      employees={workspace.employees}
      jobs={workspace.jobs}
      customers={workspace.customers}
      invoices={workspace.invoices}
      estimates={workspace.estimates}
      settings={workspace.settings}
      session={session}
      people={people}
      initialId={searchParams.id}
      initialJob={searchParams.job}
      initialTab={searchParams.tab}
      initialStage={searchParams.stage}
      forceSetup={false}
    />
    {/* Multi-shop B2: a phone setting up a brand-new shop can go back to its real shop's sign-in. */}
    {!session && !workspace.settings.setupComplete && (cookies().get(SHOP_COOKIE)?.value || DEFAULT_SHOP) !== DEFAULT_SHOP ? <NewShopBar /> : null}
    {session?.role === "ADMIN" ? <DeskHoursScope people={deskPeople} actor={session.name || "Office"} date={today} /> : null}
    </OneMicProvider>
    </AiConsentGate>
    </DeviceLookProvider>
  );
}
