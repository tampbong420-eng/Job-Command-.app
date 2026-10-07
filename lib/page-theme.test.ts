import assert from "node:assert/strict";
import test from "node:test";
import { PIPE_STEPS } from "./job-pipeline";
import { PAGE_THEME, pagePathFor, stagePathFor, STAGE_BUTTON_ROUTE, SHOCK_BLUE, nextStageAfter } from "./page-theme";

test("customer names use the main white ink", () => {
  assert.equal(SHOCK_BLUE.toLowerCase(), "#efefef");
  assert.equal(PAGE_THEME.command.edge.toLowerCase(), "#dc2626");
  assert.equal(PAGE_THEME.setup.edge.toLowerCase(), "#dc2626");
  assert.equal(PAGE_THEME.gate.edge.toLowerCase(), "#dc2626");
  assert.equal(PAGE_THEME.crew.edge.toLowerCase(), "#f97316");
  assert.equal(PAGE_THEME.company.edge.toLowerCase(), "#64748b");
});

test("each Command pipeline bar maps to its own stage", () => {
  assert.equal(stagePathFor("lead"), "lead");
  assert.equal(stagePathFor("estimate"), "estimate");
  assert.equal(stagePathFor("schedule"), "schedule");
  assert.equal(stagePathFor("active"), "active");
  assert.equal(stagePathFor("pay"), "invoice");
  assert.equal(stagePathFor("archive"), "archive");
  const destinations = Object.values(STAGE_BUTTON_ROUTE);
  assert.equal(new Set(destinations).size, destinations.length);
  assert.ok(!destinations.includes("field" as never));
  assert.ok(!destinations.includes("work" as never));
});

test("pipeline bar fills match destination outline colors", () => {
  assert.equal(PAGE_THEME.lead.edge, PIPE_STEPS[0].fill);
  assert.equal(PAGE_THEME.estimate.edge, PIPE_STEPS[1].fill);
  assert.equal(PAGE_THEME.schedule.edge, PIPE_STEPS[2].fill);
  assert.equal(PAGE_THEME.active.edge, PIPE_STEPS[3].fill);
  assert.equal(PAGE_THEME.invoice.edge, PIPE_STEPS[4].fill);
  assert.equal(PAGE_THEME.archive.edge, PIPE_STEPS[5].fill);
  const edges = ["lead", "estimate", "schedule", "active", "invoice", "archive"].map(
    (key) => PAGE_THEME[key as keyof typeof PAGE_THEME].edge
  );
  assert.equal(new Set(edges).size, edges.length);
});

test("job stages beat the Command dock for outline color", () => {
  assert.equal(pagePathFor({ tab: "command", jobStage: "lead" }), "lead");
  assert.equal(pagePathFor({ tab: "command", jobStage: "estimate" }), "estimate");
  assert.equal(pagePathFor({ tab: "command", jobStage: "schedule" }), "schedule");
  assert.equal(pagePathFor({ tab: "command", jobStage: "active" }), "active");
  assert.equal(pagePathFor({ tab: "command", jobStage: "invoice" }), "invoice");
  assert.equal(pagePathFor({ tab: "command", jobStage: "archive" }), "archive");
  assert.notEqual(PAGE_THEME.lead.edge, PAGE_THEME.estimate.edge);
  assert.notEqual(PAGE_THEME.estimate.edge, PAGE_THEME.schedule.edge);
  assert.notEqual(PAGE_THEME.schedule.edge, PAGE_THEME.active.edge);
  assert.notEqual(PAGE_THEME.active.edge, PAGE_THEME.invoice.edge);
  assert.notEqual(PAGE_THEME.invoice.edge, PAGE_THEME.archive.edge);
});

test("Invoice and Paid share dark green; archive is gray-black after paid", () => {
  assert.equal(stagePathFor("pay"), "invoice");
  assert.equal(PAGE_THEME.invoice.edge, "#166534");
  assert.equal(PAGE_THEME.pay.edge, "#14532d");
  assert.equal(PAGE_THEME.archive.edge, "#27272a");
  assert.notEqual(PAGE_THEME.invoice.edge, PAGE_THEME.pay.edge);
  assert.notEqual(PAGE_THEME.archive.edge, PAGE_THEME.invoice.edge);
  assert.notEqual(PAGE_THEME.archive.edge, PAGE_THEME.active.edge);
});

test("completing a stage hops to the next isolated screen", () => {
  assert.equal(nextStageAfter("lead"), "estimate");
  assert.equal(nextStageAfter("estimate"), "schedule");
  assert.equal(nextStageAfter("schedule"), "active");
  assert.equal(nextStageAfter("active"), "invoice");
  assert.equal(nextStageAfter("invoice"), "archive");
  assert.equal(nextStageAfter("archive"), null);
});

test("Command bars cannot inherit folder or field destinations", () => {
  assert.equal(pagePathFor({ jobStage: "invoice", folder: true, folderTab: "work" }), "invoice");
  assert.equal(pagePathFor({ jobStage: "schedule", folder: true, folderTab: "work" }), "schedule");
  assert.equal(pagePathFor({ jobStage: "active", folder: true, folderTab: "work" }), "active");
  assert.equal(pagePathFor({ jobStage: "active" }), "active");
  assert.equal(pagePathFor({ jobStage: "field" }), "field");
  assert.notEqual(stagePathFor("active"), "field");
});

test("folder tabs do not steal pipeline outline colors", () => {
  assert.equal(pagePathFor({ folder: true, folderTab: "work", tab: "schedule" }), "schedule");
  assert.equal(pagePathFor({ folder: true, folderTab: "invoice", tab: "command" }), "command");
  assert.equal(pagePathFor({ folder: true, folderTab: "estimate", tab: "command" }), "command");
  assert.equal(pagePathFor({ folder: true, folderTab: "details", tab: "command" }), "command");
});

test("dock tabs keep their own colors when no job stage is open", () => {
  assert.equal(pagePathFor({ tab: "command" }), "command");
  assert.equal(pagePathFor({ tab: "crew" }), "crew");
  assert.equal(pagePathFor({ tab: "schedule" }), "schedule");
  assert.equal(pagePathFor({ tab: "pay" }), "pay");
});
