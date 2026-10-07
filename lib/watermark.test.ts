import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const desk = readFileSync(new URL("../components/command/EmployeeWorkspace.tsx", import.meta.url), "utf8");
const rule = css.match(/\n\.jc-watermark\s*\{[^}]+\}/)?.[0] || "";

test("watermark is Eric's real shield file, only made faint", () => {
  assert.ok(rule, "missing .jc-watermark rule");
  assert.match(rule, /url\("\/brand\/jc-shield@2x\.png"\)/);
  assert.ok(existsSync(new URL("../public/brand/jc-shield@2x.png", import.meta.url)));
  assert.doesNotMatch(rule, /filter|mix-blend|hue|jc-wallpaper|job-command-logo|\.svg/);
  assert.match(rule, /--jc-wm-dark:\s*0\.05/);
  assert.match(rule, /--jc-wm-light:\s*0\.07/);
  assert.match(css, /\.app-shell\[data-shell="light"\] \.jc-watermark\s*\{\s*opacity:\s*var\(--jc-wm-light\)/);
});

test("watermark is fixed, centered, behind content and takes no taps", () => {
  for (const want of [/position:\s*fixed/, /left:\s*50%/, /top:\s*50%/, /width:\s*70vw/, /max-width:\s*520px/, /translate\(-50%, -50%\)/, /pointer-events:\s*none/, /z-index:\s*0;/]) {
    assert.match(rule, want);
  }
});

test("watermark is the first child of every .app-shell (PIN gate included) and hidden from screen readers", () => {
  assert.match(desk, /ref=\{swipe\?\.ref\}\s*>\s*\{\/\*[^*]*\*\/\}\s*<div className="jc-watermark" aria-hidden="true" \/>\s*<div className="grain" \/>/);
});

test("old non-logo wallpaper is not referenced anywhere in the CSS", () => {
  assert.doesNotMatch(css, /jc-wallpaper/);
});
