import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const pdf = readFileSync(new URL("../app/api/export/document/route.ts", import.meta.url), "utf8");

test("only letters the user types turn hot pink", () => {
  const desk = readFileSync(new URL("../components/command/EmployeeWorkspace.tsx", import.meta.url), "utf8");
  assert.match(css, /\[data-user-ink="1"\] \{[^}]*color:\s*#ff69b4 !important/s);
  assert.doesNotMatch(css, /\.app-shell input:not\(\[type="checkbox"\]\)/);
  assert.match(desk, /dataset\.loaded/);
  assert.match(desk, /dataset\.userInk = "1"/);
  assert.match(desk, /field\.value !== field\.dataset\.loaded/);
});

test("every screen gets the schedule neon glow from the palette", () => {
  for (const color of ["#ff2bd6", "#ff9a00", "#c8ff00", "#2ef6e6", "#2f6bff", "#b44dff"]) {
    assert.match(css, new RegExp(color));
  }
  assert.match(css, /text-shadow:[\s\S]*0 0 32px var\(--neon\)/);
  assert.match(css, /data-neon="lime"/);
  const desk = readFileSync(new URL("../components/command/EmployeeWorkspace.tsx", import.meta.url), "utf8");
  assert.match(desk, /contentNeon/);
  assert.match(desk, /data-neon=\{neon/);
});

test("invoices and estimates that go out stay a white sheet", () => {
  assert.match(css, /\.client-quote \{[^}]*background:\s*#f6f5f2/s);
  assert.match(css, /\.client-quote \{[^}]*color:\s*#161616/s);
  assert.match(css, /\.client-quote input,\s*\n\.client-quote textarea,\s*\n\.client-quote select \{[^}]*color:\s*#161616/s);
  assert.match(css, /\.doc-preview > b,\s*\n\.doc-preview > span[\s\S]*color:\s*#ffffff/);
  assert.doesNotMatch(pdf, /ff69b4/i);
  assert.match(pdf, /setFillColor\(250, 250, 248\)/);
  assert.match(pdf, /setTextColor\(17, 17, 17\)/);
});
