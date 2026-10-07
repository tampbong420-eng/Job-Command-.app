import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { contactSource, initials, nativeContactsPlugin, personFromContact, pickContacts } from "./signup-contacts";
import { inviteKey, inviteSmsHref, inviteText, invitesSentLine, phoneDigitsForSms } from "./signup-invites";

const setup = readFileSync(new URL("../components/command/CompanySetup.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/signup-actions.ts", import.meta.url), "utf8");

test("contacts: browser picker on Android Chrome, Capacitor plugin in the native shell, else the add sheet", () => {
  assert.equal(contactSource({}), "none");
  assert.equal(contactSource({ navigator: { contacts: { select: async () => [] } } }), "web");
  const plugin = { pickContact: async () => ({ contact: {} }) };
  const native = { isNativePlatform: () => true, isPluginAvailable: () => true, Plugins: { Contacts: plugin } };
  assert.equal(contactSource({ Capacitor: native, navigator: {} }), "native");
  // Native shell without the plugin registered falls back cleanly.
  assert.equal(nativeContactsPlugin({ Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => false, Plugins: {} } }), null);
  assert.equal(contactSource({ Capacitor: { isNativePlatform: () => false } }), "none");
});

test("picked contacts become Crew rows with photo or initials", async () => {
  const web = {
    navigator: {
      contacts: {
        getProperties: async () => ["name", "tel"],
        select: async (props: string[]) => {
          assert.deepEqual(props, ["name", "tel"]);
          return [{ name: ["Riley Nash"], tel: ["501-555-0188"] }, { name: [""], tel: [] }];
        },
      },
    },
  };
  const rows = await pickContacts(web);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { firstName: "Riley", lastName: "Nash", phone: "(501) 555-0188", role: "crew" });
  const native = {
    Capacitor: {
      isNativePlatform: () => true,
      Plugins: {
        Contacts: {
          pickContact: async () => ({ contact: { name: { given: "Sam", family: "Ellis" }, phones: [{ number: "5015550123" }], image: { base64String: "AAA" } } }),
        },
      },
    },
  };
  const [sam] = await pickContacts(native);
  assert.equal(sam.firstName, "Sam");
  assert.equal(sam.photo, "data:image/jpeg;base64,AAA");
  assert.equal(personFromContact({ name: "", tel: "" }), null);
  assert.equal(initials({ firstName: "jordan", lastName: "vance" }), "JV");
  assert.equal(initials({ firstName: "", lastName: "" }), "?");
  // Closing the picker is not an error.
  assert.deepEqual(await pickContacts({ navigator: { contacts: { select: async () => Promise.reject(new Error("closed")) } } }), []);
});

test("invites open the phone's own Messages with that person's link (no server texting)", () => {
  assert.equal(phoneDigitsForSms("(501) 555-0188"), "+15015550188");
  const body = inviteText({ firstName: "Riley", shop: "Top Gun Painting", owner: "Eric", url: "https://x.test/j/abc", role: "crew" });
  assert.match(body, /Riley/);
  assert.match(body, /https:\/\/x\.test\/j\/abc/);
  assert.match(body, /last 4 of your phone/);
  assert.match(inviteText({ firstName: "Jordan", shop: "S", owner: "Eric", url: "https://x.test/", role: "boss" }), /office PIN/);
  const android = inviteSmsHref("501-555-0188", body, "Mozilla/5.0 (Linux; Android 14) Chrome");
  assert.ok(android.startsWith("sms:+15015550188?body="));
  assert.ok(inviteSmsHref("501-555-0188", body, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)").startsWith("sms:+15015550188&body="));
  assert.equal(decodeURIComponent(android.split("body=")[1]), body);
  assert.equal(invitesSentLine(3), "3 invites sent");
  assert.equal(invitesSentLine(1), "1 invite sent");
  assert.equal(invitesSentLine(0), "");
  assert.equal(inviteKey({ firstName: "Riley ", lastName: "Nash", phone: "(501) 555-0188" }), "riley|nash|5015550188");
});

test("Add people screen matches the approved mockup", () => {
  assert.match(setup, /From contacts/);
  assert.doesNotMatch(setup, /Paste a list/);
  assert.doesNotMatch(setup, /Save my crew/);
  assert.match(setup, /＋ Add one by name &amp; phone/);
  assert.match(setup, /Pay rates come later, on their first timesheet\./);
  assert.match(setup, /data-person-row="1"/);
  assert.match(setup, /initials\(person\)/);
  assert.match(setup, /person\.photo/);
  // Inline CREW / BOSS toggle on each row.
  assert.match(setup, /\(\["crew", "boss"\] as const\)\.map/);
  // No picker (desktop / iOS Safari): the button opens the name & phone sheet.
  assert.match(setup, /if \(contacts === "none"\) \{\s*setEditing/);
  // Invites: sms: link per person + Copy link, recorded as invited.
  assert.match(setup, /inviteSmsHref\(/);
  assert.match(setup, /Copy link/);
  assert.match(setup, /recordInvitesSent/);
  assert.match(actions, /action: "Texted crew invite"/);
  assert.match(actions, /\/j\/\$\{encodeURIComponent\(hit\.inviteToken\)\}/);
});
