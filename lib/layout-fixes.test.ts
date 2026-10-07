import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const profilePay = readFileSync(new URL("../components/command/ProfilePay.tsx", import.meta.url), "utf8");

test("setup, Company, and the PIN gate keep a 12px side margin", () => {
  assert.match(css, /\.app-shell \.setup-desk,\s*\.app-shell \.company-desk,\s*\.app-shell \.access-gate \{\s*padding-left: 12px;\s*padding-right: 12px;/);
  assert.match(css, /\.setup-desk\.signup \.talk-form \{\s*grid-template-columns: minmax\(0, 1fr\) 44px/);
});

test("PIN keypad is centered", () => {
  assert.match(css, /\.access-pad \{\s*width: 100%;\s*margin-inline: auto;/);
  assert.match(css, /\.access-dots \{\s*justify-content: center;/);
});

test("pay sections on the profile each get their own header line", () => {
  // The old Roster › Pay folder (PaymentLedger "Payroll" title) moved onto the profile 2026-10-02.
  for (const head of ["Pay", "Job record", "This pay period", "Direct deposit", "Week archive", "Year to date"]) {
    assert.ok(profilePay.includes(head), head);
  }
  assert.match(profilePay, /className=\{s\.head\}/);
});

test("job ticket beside Back never wraps", () => {
  assert.match(css, /\.folder-top \.card-label \{\s*white-space: nowrap;\s*flex-shrink: 0;/);
});

test("scrolled pages stop under the corner chip lane instead of sliding beneath it", () => {
  assert.match(css, /\.app-shell\.has-dock \.page\.docked \{\s*padding-top: 0;\s*margin-top: 58px;/);
});
