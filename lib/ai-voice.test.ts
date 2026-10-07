import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTRACTOR_DIRECTIVE,
  CREW_VOICE,
  ROBOT_TALK,
  crewTextInput,
  isRobotTalk,
  leadInput,
  leadPrompt,
  photoPrompt,
  orangePhotoPrompt,
  setupInput,
  setupPrompt,
  talkPrompt,
} from "./ai-voice";
import { invoiceMail, estimateMessage } from "./estimate-copy";
import { copilotTalk, type PipeFacts } from "./job-pipeline";
import type { JobDTO } from "./types";

const job: JobDTO = {
  id: "job_lake",
  code: "JC-2104",
  name: "Lake house exterior",
  client: "Maya Chen",
  customerId: "cust_maya",
  address: "Hot Springs, AR",
  notes: "",
  timeline: "",
  dueDate: null,
  pipeline: 0,
  leadCalledAt: null,
  photos: [],
};

function facts(partial: Partial<PipeFacts> = {}): PipeFacts {
  return {
    phone: "",
    email: "",
    property: "the lake house",
    leadCalled: false,
    appointment: false,
    estimateReady: false,
    estimateSent: false,
    estimateViewed: false,
    estimateApproved: false,
    estimateChanges: false,
    startDate: false,
    crewAssigned: false,
    materialsReady: false,
    onSite: false,
    onSiteNames: [],
    invoiceSent: false,
    paid: false,
    ...partial,
  };
}

test("prompts sound like a male contractor partner, not a status log", () => {
  const prompt = talkPrompt("Pull line items.", "Eight hours labor on the fascia.");
  assert.equal(
    CONTRACTOR_DIRECTIVE,
    "You are Job Command's lead AI assistant. You speak strictly with the tone and vocabulary of a seasoned, rugged male general contractor. Never use generic assistant filler like \"How may I help you today?\" or robotic pleasantries. Keep answers direct, sharp, and focused on job execution, crew scheduling, and estimates."
  );
  assert.ok(CREW_VOICE.startsWith(CONTRACTOR_DIRECTIVE));
  assert.match(CREW_VOICE, /seasoned, rugged male general contractor/);
  assert.match(CREW_VOICE, /How may I help you today/);
  assert.match(CREW_VOICE, /job execution, crew scheduling, and estimates/);
  assert.match(CREW_VOICE, /zero is allowed/);
  assert.match(CREW_VOICE, /driveway/);
  assert.match(CREW_VOICE, /hold the mic/);
  assert.doesNotMatch(CREW_VOICE, /warm, short, sure/);
  for (const phrase of ROBOT_TALK) {
    assert.match(CREW_VOICE, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    assert.equal(isRobotTalk(phrase), true);
  }
  assert.equal(isRobotTalk(prompt), false);
  assert.equal(isRobotTalk(CREW_VOICE.replace(/"[^"]+"/g, "").replace(/'[^']+'/g, "")), false);
  assert.match(prompt, /Eight hours labor/);
  assert.doesNotMatch(prompt, /processing complete/i);
  const photos = photoPrompt(
    { code: "JC-2104", name: "Harbor trim", client: "Harbor", address: "Higdon Ferry", notes: "" },
    "$45/hr"
  );
  assert.match(photos, /looking at site photos/);
  const orange = orangePhotoPrompt(
    { code: "JC-2104", name: "Harbor trim", client: "Harbor", address: "Higdon Ferry", notes: "leave the brick" },
    "labor $48/hr, Duration $54/gal",
    "two story exterior"
  );
  assert.match(orange, /Orange/);
  assert.match(orange, /two story exterior/);
  assert.match(orange, /still edit/);
  assert.match(leadPrompt("Maya at the lake house"), /Maya at the lake house/);
  assert.match(setupPrompt("payroll", "every two weeks"), /every two weeks/);
});

test("model calls send the crew persona as the system prompt", () => {
  const talk = crewTextInput("Pull line items.", "Eight hours labor on the fascia.");
  assert.equal(talk.system, CREW_VOICE);
  assert.match(talk.prompt, /Eight hours labor/);
  assert.doesNotMatch(talk.prompt, /You're riding shotgun/);
  const lead = leadInput("Maya at the lake house");
  assert.equal(lead.system, CREW_VOICE);
  const setup = setupInput("payroll", "every two weeks");
  assert.equal(setup.system, CREW_VOICE);
});

test("co-pilot talk stays conversational", () => {
  const missingPhone = copilotTalk(job, facts(), 0);
  assert.match(missingPhone, /no number/i);
  assert.equal(isRobotTalk(missingPhone), false);
  assert.doesNotMatch(missingPhone, /bar stays outline/i);
  assert.doesNotMatch(missingPhone, /processing complete/i);
  const afterCall = copilotTalk(job, facts({ phone: "501-555-0100", leadCalled: true }), 1);
  assert.match(afterCall, /Alright|Got it/);
  assert.match(afterCall, /Schedule/);
  assert.match(afterCall, /visit|bid/i);
  assert.doesNotMatch(afterCall, /Dictate|Parse|From Roll/);
  assert.equal(isRobotTalk(afterCall), false);
  const orangeReady = copilotTalk(
    job,
    facts({
      phone: "501-555-0100",
      leadCalled: true,
      appointment: true,
      estimateReady: true,
      estimateSent: true,
      estimateApproved: true,
    }),
    2
  );
  assert.match(orangeReady, /Orange estimate is locked/);
  assert.match(orangeReady, /crew/i);
  assert.match(orangeReady, /rolling out/);
  assert.equal(isRobotTalk(orangeReady), false);
});

test("client estimate and invoice copy is not corporate", () => {
  const estimate = estimateMessage({
    who: "Maya",
    company: "Top Gun Painting",
    jobName: "Lake house exterior",
    url: "https://jobcommand.local/e/abc",
    total: "$4,200",
  });
  assert.match(estimate.text, /Here’s the number/);
  assert.doesNotMatch(estimate.text, /Please find/i);
  assert.doesNotMatch(estimate.text, /processing complete/i);
  const invoice = invoiceMail({
    who: "Maya",
    jobName: "Lake house exterior",
    number: "INV-1002",
    total: "$4,200",
  });
  assert.match(invoice.body, /Here’s invoice/);
  assert.doesNotMatch(invoice.body, /Please find/i);
  assert.doesNotMatch(invoice.subject, /Please/i);
});
