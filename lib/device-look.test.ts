import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DEVICE_LOOK_COOKIE,
  PILL_LOOKS,
  deviceLookCookie,
  deviceLookCookieName,
  deviceLookFromCookies,
  parseDeviceLook,
  startingShellChoice,
} from "./device-look";
import { DEFAULT_SHELL_THEME, parseShellTheme } from "./shell-theme";

const root = path.join(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

test("first load is Dark for everyone: new shop, new phone, junk", () => {
  assert.equal(DEFAULT_SHELL_THEME, "ink");
  assert.equal(startingShellChoice(null, undefined), "ink");
  assert.equal(startingShellChoice(null, ""), "ink");
  assert.equal(startingShellChoice(null, "harbor-day"), "ink");
  assert.equal(parseShellTheme("nonsense"), "ink");
  // The live shop is saved on ink and stays there.
  assert.equal(startingShellChoice(null, "ink"), "ink");
  // Auto is still an option when someone picks it on purpose.
  assert.equal(startingShellChoice(null, "auto"), "auto");
  assert.match(read("prisma/schema.prisma"), /shellTheme\s+String\s+@default\("ink"\)/);
});

test("this phone's pick wins over the shop's App look and survives reload (cookie)", () => {
  assert.equal(startingShellChoice("light", "ink"), "light");
  assert.equal(startingShellChoice("ink", "light"), "ink");
  const jar: Record<string, string> = { [deviceLookCookieName("acct_1")]: "light" };
  const get = (name: string) => jar[name];
  assert.equal(deviceLookFromCookies(get, "acct_1"), "light");
  // Another person on the same phone does not inherit it…
  assert.equal(deviceLookFromCookies(get, "acct_2"), null);
  // …and the sign-in screen uses the phone's last pick.
  jar[deviceLookCookieName(null)] = "light";
  assert.equal(deviceLookFromCookies(get, null), "light");
  assert.equal(parseDeviceLook("LIGHT"), "light");
  assert.equal(parseDeviceLook("dark"), null);
  assert.equal(parseDeviceLook("<script>"), null);
  assert.equal(deviceLookCookieName("a;b=c d"), `${DEVICE_LOOK_COOKIE}_abcd`);
  assert.equal(deviceLookCookieName(""), `${DEVICE_LOOK_COOKIE}_guest`);
  const cookie = deviceLookCookie("acct_1", "light", true);
  assert.match(cookie, /^jc_look_acct_1=light; Path=\/; Max-Age=31536000; SameSite=Lax; Secure$/);
  assert.doesNotMatch(deviceLookCookie("acct_1", "ink", false), /Secure/);
});

test("pill: DARK | LIGHT, 48px halves, 16px labels, left of the badge on every app screen", () => {
  assert.deepEqual(PILL_LOOKS.map((o) => [o.id, o.label]), [["ink", "Dark"], ["light", "Light"]]);
  const css = read("components/command/ThemeSwitch.module.css");
  assert.match(css, /\.pill \{[^}]*height: 48px;/);
  assert.match(css, /\.half \{[^}]*height: 48px;[^}]*min-height: 48px;[^}]*font: 800 16px\/1/);
  // v2: the Light half is white, not gold.
  assert.match(css, /\.light \.half\.on::before \{\s*background: #ffffff;/);
  assert.doesNotMatch(css, /#facc15|#fde68a/);
  const sw = read("components/command/ThemeSwitch.tsx");
  assert.match(sw, /aria-pressed=\{on\}/);
  assert.match(sw, /writeDeviceLook\(accountKey, next\)/);
  assert.doesNotMatch(sw, /saveShellTheme/, "the pill never changes the shop's saved theme");
  const ws = read("components/command/EmployeeWorkspace.tsx");
  // Top bar (Eric 2026-10-03): bell LEFT, logo image CENTER, mic slot RIGHT; DARK|LIGHT moved to the dock.
  assert.match(ws, /<div className="top-trio-center">\s*<img className="brand-wordmark-img" src="\/brand\/job-command-wordmark\.png"/);
  assert.match(ws, /<DockThemeToggle \/>/);
  assert.match(ws, /data-count=\{items\.length \+ 2\}/);
  assert.match(ws, /data-dock="theme"/);
  assert.match(ws, /<header className="topbar topbar-notify top-trio" data-top-trio="1">\s*<div className="top-trio-left topbar-notify-area">\s*<AlertCenter[\s\S]*?<div className="top-trio-center">\s*<ThemeSwitch \/>/);
  assert.match(ws, /initial=\{startingShellChoice\(device\.choice, look\)\}/);
  assert.match(ws, /writeDeviceLook\(device\.accountKey, next\);/);
  const page = read("app/page.tsx");
  assert.match(page, /<DeviceLookProvider[\s\S]*deviceLookFromCookies\(\(name\) => cookies\(\)\.get\(name\)\?\.value, session\?\.accountId\)/);
});

test("Light fixes: Edit / New job and the PIN keypad are no longer black on black", () => {
  const css = read("app/globals.css");
  const light = css.slice(css.indexOf("LIGHT THEME READABILITY"), css.indexOf("end LIGHT THEME READABILITY"));
  assert.match(light, /\.app-shell\[data-shell="light"\] \.jobs-bottom-actions \.ghost-action:not\(\[aria-pressed="true"\]\) \{\s*background: #ffffff !important;\s*color: #111111 !important;/);
  assert.match(light, /\.app-shell\[data-shell="light"\] \.access-key \{\s*background: #ffffff !important;\s*color: #111111 !important;/);
});
