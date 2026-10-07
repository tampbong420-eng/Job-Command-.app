import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("Jobs header: Eric's 120pt shield crop top-left beside 'Jobs', badge corner kept clear (approved mockup)", () => {
  const center = read("components/command/CommandCenter.tsx");
  const css = read("components/command/JobsHeader.module.css");
  assert.match(center, /src="\/brand\/jc-shield@2x\.png"/);
  assert.ok(existsSync(join(root, "public/brand/jc-shield@2x.png")));
  assert.match(center, /<h1>Jobs<\/h1>/);
  assert.match(css, /\.shield \{[^}]*width:\s*120px/);
  assert.match(css, /\.lock \{[^}]*padding-right:\s*64px/);
  // No shop name in the Jobs header.
  const mast = center.slice(center.indexOf('data-jobs-logo="1"'), center.indexOf("<AppointmentNotice"));
  assert.doesNotMatch(mast, /businessName|shopName/);
});

test("Schedule header is just 'Schedule': no shield, no shop name (approved Light v2 NOTES)", () => {
  const board = read("components/command/TimesheetBoard.tsx");
  const mast = board.slice(board.indexOf('className="command-mast jobs-mast schedule-banner sched-mast"'), board.indexOf("{children}"));
  assert.match(mast, /<h1>Schedule<\/h1>/);
  assert.doesNotMatch(mast, /jc-shield|sched-lock-mark|sched-lock-shop|shopName/);
});
