import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_SHELL_LOOK,
  DEFAULT_SHELL_THEME,
  SHELL_THEME_CHOICES,
  SHELL_THEMES,
  SHELL_THEME_IDS,
  WORKFLOW_STEPS,
  paletteReadable,
  parseShellTheme,
  shellThemeById,
  workflowStepForPath,
} from "./shell-theme";
// The Auto look's own tests (sunrise/sunset, lux hysteresis, override order) run with this file.
import "./theme-auto.test";

test("two looks plus Auto, and the same six workflow colors", () => {
  assert.deepEqual([...SHELL_THEME_IDS], ["auto", "ink", "light"]);
  assert.deepEqual(SHELL_THEMES.map((theme) => theme.id), ["ink", "light"]);
  assert.deepEqual(SHELL_THEME_CHOICES.map((choice) => choice.label), ["Auto", "Lime Industrial", "Light"]);
  assert.equal(DEFAULT_SHELL_THEME, "ink");
  assert.equal(DEFAULT_SHELL_LOOK, "ink");
  assert.equal(SHELL_THEMES[0].name, "Lime Industrial");
  assert.equal(SHELL_THEMES[1].name, "Light");
  assert.equal(WORKFLOW_STEPS.length, 6);
  assert.equal(WORKFLOW_STEPS[0].label, "New Lead Call");
  assert.equal(WORKFLOW_STEPS[1].label, "Schedule Estimate");
  assert.equal(WORKFLOW_STEPS[2].label, "Assign Crew and Materials");
  assert.equal(WORKFLOW_STEPS[3].label, "Active on Job");
  assert.equal(WORKFLOW_STEPS[4].label, "Invoice Paid");
  assert.equal(WORKFLOW_STEPS[5].label, "Finished Archive");
  const pulses = WORKFLOW_STEPS.map((step) => step.pulse.toLowerCase());
  assert.equal(new Set(pulses).size, 6);
  assert.equal(workflowStepForPath("command"), 1);
  assert.equal(workflowStepForPath("lead"), 1);
  assert.equal(workflowStepForPath("estimate"), 2);
  assert.equal(workflowStepForPath("crew"), 3);
  assert.equal(workflowStepForPath("schedule"), 3);
  assert.equal(workflowStepForPath("active"), 4);
  assert.equal(workflowStepForPath("pay"), 5);
  assert.equal(workflowStepForPath("invoice"), 5);
  assert.equal(workflowStepForPath("company"), 6);
  assert.equal(workflowStepForPath("archive"), 6);
  assert.equal(shellThemeById("light").canvas, "light");
  assert.equal(shellThemeById("light").wash, false);
  assert.equal(shellThemeById("light").invertedButtons, true);
  assert.equal(shellThemeById("ink").invertedButtons, false);
  assert.equal(shellThemeById("ink").wash, false);
});

test("removed looks and unknown ids move to Dark (Lime Industrial); Auto, Light and Lime Industrial stay put", () => {
  assert.equal(parseShellTheme("INK"), "ink");
  assert.equal(parseShellTheme("light"), "light");
  assert.equal(parseShellTheme("auto"), "auto");
  assert.equal(parseShellTheme("white"), "light");
  for (const gone of [
    "dark",
    "color",
    "workflow",
    "field",
    "shop",
    "night",
    "harbor-night",
    "harbor-day",
    "signal-night",
    "signal-day",
    "grove-night",
    "grove-day",
    "dusk-night",
    "dusk-day",
    "neon",
    "",
  ]) {
    assert.equal(parseShellTheme(gone), "ink", gone);
  }
  assert.equal(parseShellTheme(null), "ink");
  // Auto (or junk) never paints a blank style: it falls back to Lime Industrial until resolved.
  assert.equal(shellThemeById("auto").id, "ink");
  assert.equal(shellThemeById("dark").id, "ink");
  for (const theme of SHELL_THEMES) {
    if (theme.palette) assert.equal(paletteReadable(theme.palette), true, theme.id);
  }
  assert.equal(shellThemeById("light").tint, 0);
  assert.ok(shellThemeById("ink").tint > 0);
});

test("Company mounts the theme picker; signup defers the look to Office", () => {
  const setup = readFileSync(new URL("../components/command/CompanySetup.tsx", import.meta.url), "utf8");
  const desk = readFileSync(new URL("../components/command/EmployeeWorkspace.tsx", import.meta.url), "utf8");
  const picker = readFileSync(new URL("../components/command/ThemePicker.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(setup, /ThemePicker/);
  assert.doesNotMatch(setup, /data-setup-theme-toggle/);
  assert.match(setup, /shellTheme/);
  assert.match(setup, /DEFAULT_SHELL_THEME/);
  assert.match(setup, /\/brand\/job-command-lockup-cut@2x\.webp/);
  assert.match(desk, /ThemePicker/);
  assert.match(desk, /PaymentPrefsForm/);
  assert.match(desk, /data-theme-settings/);
  assert.match(desk, /data-pay-settings/);
  assert.match(desk, /data-step=\{step\}/);
  assert.match(desk, /data-canvas=\{theme\.canvas\}/);
  assert.match(desk, /data-wash=\{theme\.wash \? "on" : "off"\}/);
  assert.match(desk, /data-buttons=\{theme\.invertedButtons \? "inverted" : "standard"\}/);
  assert.match(picker, /data-theme-picker/);
  assert.match(picker, /Pick your look/);
  assert.match(picker, /SHELL_THEME_CHOICES\.map/);
  assert.doesNotMatch(picker, /Theme \{index \+ 1\}/);
  assert.match(desk, /data-shell=\{look\}/);
});

test("Lime Industrial replaces Ink and its paint stays on its own look", () => {
  const lime = shellThemeById("ink");
  // Same stored id, so phones and shops saved on the old Ink look land on the new skin.
  assert.equal(parseShellTheme("ink"), "ink");
  assert.equal(lime.name, "Lime Industrial");
  assert.equal(lime.label, "Lime Industrial");
  assert.equal(lime.canvas, "dark");
  assert.ok(lime.palette);
  assert.equal(paletteReadable(lime.palette!), true);
  assert.equal(lime.palette!.accent.toLowerCase(), "#b2ff00");

  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const marker = css.indexOf("LIME INDUSTRIAL SKIN");
  assert.ok(marker > 0, "skin block present");
  const before = css.slice(0, marker);
  const skin = css.slice(css.lastIndexOf("/*", marker));
  assert.doesNotMatch(before, /--li-/, "no skin token leaks above the block");

  // Every rule in the block is scoped to the Lime Industrial root.
  const root = '.app-shell[data-shell="ink"]';
  const bare = skin.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [...bare.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim());
  assert.ok(selectors.length > 40);
  for (const group of selectors) {
    for (const sel of group.split(/,(?![^(]*\))/)) {
      assert.ok(sel.trim().startsWith(root), `unscoped selector: ${sel.trim()}`);
    }
  }
  assert.doesNotMatch(skin, /data-shell="dark"|data-shell="light"/);
  assert.doesNotMatch(skin, /@import|fonts\.googleapis|@font-face/);

  // Lime Industrial's own base tokens are exactly what they were.
  assert.match(
    css,
    /\.app-shell\[data-shell="ink"\] \{\n  --tint-alpha: 0\.05;\n  --bg-black: #0d0d0d;\n  --card-charcoal: #1e1e1e;\n  --card-bg: #1e1e1e;\n  --plate: #1e1e1e;\n  --metal-0: #111111;\n  --metal-1: #1e1e1e;\n  --btn-fill: #ffffff;\n  --btn-ink: #0d0d0d;\n  background-color: #0d0d0d;\n\}/
  );
  // The picker still hides Color only; Lime Industrial is a real choice.
  assert.match(css, /\.theme-picker-choices button\[data-theme-id="color"\] \{\n  display: none;/);
  assert.doesNotMatch(css, /button\[data-theme-id="ink"\]/);
});
