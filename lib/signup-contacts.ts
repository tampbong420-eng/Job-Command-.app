/**
 * "From contacts" on the Add people screen.
 * - Android Chrome: the browser Contact Picker API (navigator.contacts.select).
 * - Native app: a Capacitor Contacts plugin, when the wrapped app ships one (see nativeContactsPlugin).
 * - Anywhere else (desktop, iOS Safari): no picker; the button opens the name & phone sheet.
 * Client-safe: no server imports. Photos stay on the phone (object URLs) and are never uploaded.
 */
import { prettyPhone } from "@/lib/answering-line";
import type { SignupPerson } from "@/lib/signup-flow";

export type ContactSource = "web" | "native" | "none";

type WebContact = { name?: string[]; tel?: string[]; icon?: Blob[] };
type WebContactsManager = {
  select: (props: string[], options?: { multiple?: boolean }) => Promise<WebContact[]>;
  getProperties?: () => Promise<string[]>;
};

/** Shape of @capacitor-community/contacts' pickContact (the plugin isn't installed yet; native/README.md). */
type NativeContact = {
  name?: { display?: string | null; given?: string | null; family?: string | null } | null;
  phones?: { number?: string | null }[] | null;
  image?: { base64String?: string | null } | null;
};
type NativeContactsPlugin = {
  pickContact: (options: { projection: Record<string, boolean> }) => Promise<{ contact: NativeContact }>;
};
type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
  Plugins?: Record<string, unknown>;
};

type Env = { navigator?: unknown; Capacitor?: unknown };

function env(): Env {
  if (typeof window === "undefined") return {};
  return { navigator: window.navigator, Capacitor: (window as unknown as { Capacitor?: unknown }).Capacitor };
}

function webManager(from: Env = env()): WebContactsManager | null {
  const nav = from.navigator as { contacts?: WebContactsManager } | undefined;
  return nav?.contacts && typeof nav.contacts.select === "function" ? nav.contacts : null;
}

/** The Capacitor Contacts plugin, only inside the native shell and only if the plugin is registered. */
export function nativeContactsPlugin(from: Env = env()): NativeContactsPlugin | null {
  const cap = from.Capacitor as CapacitorGlobal | undefined;
  if (!cap?.isNativePlatform?.()) return null;
  if (cap.isPluginAvailable && !cap.isPluginAvailable("Contacts")) return null;
  const plugin = cap.Plugins?.Contacts as Partial<NativeContactsPlugin> | undefined;
  return plugin && typeof plugin.pickContact === "function" ? (plugin as NativeContactsPlugin) : null;
}

export function contactSource(from: Env = env()): ContactSource {
  if (nativeContactsPlugin(from)) return "native";
  if (webManager(from)) return "web";
  return "none";
}

/** One picked contact → one crew row (Crew by default; the owner flips Boss). */
export function personFromContact(input: { name?: string | null; given?: string | null; family?: string | null; tel?: string | null; photo?: string | null }): SignupPerson | null {
  const full = String(input.name || [input.given, input.family].filter(Boolean).join(" ")).trim().replace(/\s+/g, " ");
  const [firstName = "", ...rest] = full.split(" ");
  const tel = String(input.tel || "").trim();
  const phone = tel.replace(/\D/g, "").length >= 10 ? prettyPhone(tel) : tel;
  if (!firstName && !phone) return null;
  return { firstName: firstName || phone, lastName: firstName ? rest.join(" ") : "", phone, role: "crew", ...(input.photo ? { photo: input.photo } : {}) };
}

/** Opens the phone's contact list. Returns [] when they close it or nothing usable came back. */
export async function pickContacts(from: Env = env()): Promise<SignupPerson[]> {
  const native = nativeContactsPlugin(from);
  if (native) {
    try {
      const { contact } = await native.pickContact({ projection: { name: true, phones: true, image: true } });
      const base64 = contact?.image?.base64String;
      const person = personFromContact({
        name: contact?.name?.display,
        given: contact?.name?.given,
        family: contact?.name?.family,
        tel: contact?.phones?.[0]?.number,
        photo: base64 ? `data:image/jpeg;base64,${base64}` : null,
      });
      return person ? [person] : [];
    } catch {
      return [];
    }
  }
  const web = webManager(from);
  if (!web) return [];
  try {
    const supported = (await web.getProperties?.().catch(() => [] as string[])) || [];
    const props = ["name", "tel", ...(supported.includes("icon") ? ["icon"] : [])];
    const picked = await web.select(props, { multiple: true });
    return picked
      .map((contact) =>
        personFromContact({
          name: contact.name?.[0],
          tel: contact.tel?.[0],
          photo: contact.icon?.[0] && typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(contact.icon[0]) : null,
        })
      )
      .filter((person): person is SignupPerson => Boolean(person));
  } catch {
    return [];
  }
}

/** Two letters for the avatar when there's no contact photo. */
export function initials(person: Pick<SignupPerson, "firstName" | "lastName">) {
  const a = person.firstName.trim()[0] || "";
  const b = person.lastName.trim()[0] || "";
  return (a + b || "?").toUpperCase();
}
