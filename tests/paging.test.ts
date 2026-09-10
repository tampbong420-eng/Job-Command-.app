import assert from "node:assert/strict";
import test from "node:test";
import { canPageMember, pagingBlockReason } from "../lib/paging";
import { jobBotReply } from "../lib/bot";

test("in-app paging is blocked when the teammate is off the clock", () => {
  const reason = pagingBlockReason(true, false, "Dina");
  assert.match(reason ?? "", /Dina is currently off the clock/);
  assert.equal(canPageMember(true, false), false);
});

test("in-app paging is blocked until the caller clocks in", () => {
  const reason = pagingBlockReason(false, true, "Ricky");
  assert.match(reason ?? "", /Clock in before paging/);
  assert.equal(canPageMember(false, true), false);
});

test("in-app paging connects when both people are on the clock", () => {
  assert.equal(pagingBlockReason(true, true, "Ricky"), null);
  assert.equal(canPageMember(true, true), true);
});

test("job bot keeps the default log reply and answers shift or job questions", () => {
  const ctx = {
    isOnClock: false,
    jobTitle: "Northline Properties",
    jobAddress: "123 Painted Post Rd, Hot Springs, AR",
    supplies: "2x Graco TrueCoat 360",
  };

  assert.equal(
    jobBotReply("hello", ctx),
    "Got it. I have logged that update for your crew tracking records.",
  );
  assert.match(jobBotReply("am I on the clock?", ctx), /OFF the clock/);
  assert.match(jobBotReply("where is the job?", ctx), /Northline Properties/);
  assert.match(jobBotReply("what supplies are on the truck?", ctx), /Graco/);
});
