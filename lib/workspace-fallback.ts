import { emptyBillingDTO } from "@/lib/billing";
import type { SessionDTO, WorkspacePayload } from "@/lib/types";

export function emptyWorkspace(session: SessionDTO | null = null): WorkspacePayload {
  return {
    employees: [],
    jobs: [],
    customers: [],
    invoices: [],
    estimates: [],
    serviceCodes: [],
    settings: {
      payFrequency: "WEEKLY",
      periodAnchor: new Date().toISOString(),
      setupComplete: true,
      ownerFirstName: "",
      ownerLastName: "",
      ownerEmail: "",
      ownerPhone: "",
      // Fallback when the DB can't be read: no shop name in code (the gate shows the Job Command mark).
      businessName: "",
      businessAddress: "",
      businessEmail: "",
      industry: "",
      businessSize: "",
      accountingSoftware: "NONE",
      companyPhone: "",
      answeringLine: "",
      logoUrl: null,
      acceptCard: true,
      acceptAch: false,
      acceptCash: true,
      depositPercent: 0,
      bosses: [],
      billing: emptyBillingDTO(),
      termsAcceptedAt: null,
      termsVersion: "",
      estimatePrompt: "",
      shellTheme: "auto",
      shellInk: "",
    },
    session,
  };
}

/**
 * What a signed-out phone may see once setup is done: the shop name, logo, and look for the
 * PIN gate — no crew, jobs, clients, invoices, pay, billing, or owner contact details.
 */
export function gateWorkspace(settings: WorkspacePayload["settings"]): WorkspacePayload {
  const empty = emptyWorkspace(null);
  return {
    ...empty,
    settings: {
      ...empty.settings,
      setupComplete: settings.setupComplete,
      businessName: settings.businessName,
      industry: settings.industry,
      logoUrl: settings.logoUrl,
      shellTheme: settings.shellTheme,
      shellInk: settings.shellInk,
    },
  };
}
