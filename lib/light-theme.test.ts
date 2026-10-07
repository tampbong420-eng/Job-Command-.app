import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const darkBlock = css.match(/\.app-shell\[data-shell="dark"\]\s*\{[^}]+\}/)?.[0] || "";
const lightBlocks = [...css.matchAll(/\.app-shell\[data-shell="light"\]\s*\{[^}]+\}/g)].map((row) => row[0]);
const lastLight = lightBlocks.at(-1) || "";

test("dark theme tokens stay on the dark shell", () => {
  assert.match(css, /:root\s*\{[^}]*--text-main:\s*#efefef/s);
  assert.match(darkBlock, /--bg-black:\s*#0d0d0d/);
  assert.match(darkBlock, /--card-charcoal:\s*#1e1e1e/);
  assert.match(darkBlock, /--btn-fill:\s*#ffffff/);
  assert.match(darkBlock, /--btn-ink:\s*#0d0d0d/);
  assert.doesNotMatch(darkBlock, /--text-main:\s*#111111/);
  assert.doesNotMatch(darkBlock, /--bg-black:\s*#ffffff/);
});

test("light theme uses a white canvas and dark readable type", () => {
  assert.ok(lightBlocks.length >= 2);
  assert.match(lastLight, /--bg-black:\s*#ffffff/);
  assert.match(lastLight, /--text-main:\s*#111111/);
  assert.match(lastLight, /--text-muted:\s*#3f3f46/);
  assert.match(lastLight, /--ink:\s*#111111/);
  assert.match(lastLight, /background-color:\s*#ffffff/);
  assert.match(lastLight, /color:\s*#111111/);
  assert.match(css, /\.app-shell\[data-shell="light"\] h1/);
  assert.match(css, /\.app-shell\[data-shell="light"\] p/);
  assert.match(css, /\.app-shell\[data-shell="light"\] \.card-label/);
  assert.match(css, /\.app-shell\[data-shell="light"\] input/);
});

test("light readability does not rewrite logo burst, payroll, or dark next-action gold", () => {
  const burst = readFileSync(new URL("../components/command/LogoBurst.tsx", import.meta.url), "utf8");
  const intro = readFileSync(new URL("../components/command/IntroBoot.tsx", import.meta.url), "utf8");
  const payroll = readFileSync(new URL("../lib/payroll.ts", import.meta.url), "utf8");
  const home = readFileSync(new URL("../components/command/EmployeeHome.tsx", import.meta.url), "utf8");
  const onboard = readFileSync(new URL("../components/command/EmployeeOnboard.tsx", import.meta.url), "utf8");
  assert.match(burst, /IntroBoot/);
  assert.match(intro, /data-logo-burst/);
  assert.match(intro, /INTRO_BOOT_MARK/);
  assert.match(payroll, /federalWithholdPct/);
  assert.match(home, /Clock in/);
  assert.match(onboard, /data-employee-onboard/);
  const pulseHits = [...css.matchAll(/animation:\s*taskPulse 4s infinite ease-in-out/g)];
  assert.equal(pulseHits.length, 3);
  assert.match(css, /\.btn-next-action,\s*\.next-action-button \{[^}]*background-color:\s*#c9a227/);
});

test("Light readability fixes stay on the Light shell and above Lime Industrial", () => {
  const start = css.indexOf("LIGHT THEME READABILITY (2026-10-02)");
  const end = css.indexOf("end LIGHT THEME READABILITY");
  assert.ok(start > 0 && end > start, "block present");
  assert.ok(end < css.indexOf("LIME INDUSTRIAL SKIN"), "block sits above the Lime Industrial skin");
  const block = css.slice(css.indexOf("*/", start) + 2, css.lastIndexOf("/*", end)).replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [...block.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim());
  assert.ok(selectors.length >= 10);
  const topLevel = (group: string) => {
    const parts: string[] = [];
    let depth = 0;
    let cur = "";
    for (const ch of group) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        parts.push(cur);
        cur = "";
      } else cur += ch;
    }
    return [...parts, cur];
  };
  for (const group of selectors) {
    for (const sel of topLevel(group)) {
      assert.ok(sel.trim().startsWith('.app-shell[data-shell="light"]'), `not Light-only: ${sel.trim()}`);
    }
  }
  // Darkened schedule green meets 4.5:1 on white. The old jc-wallpaper.jpg shield is gone (not the real logo).
  assert.match(block, /--sched-job: #3f6212/);
  assert.doesNotMatch(block, /jc-wallpaper/);
  assert.doesNotMatch(css, /jc-wallpaper/);
  assert.doesNotMatch(block, /job-command-logo|jc-shield|\.svg/);
});
