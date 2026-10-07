import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const estimate = readFileSync(new URL("../components/command/EstimateStage.tsx", import.meta.url), "utf8");
const yellow = readFileSync(new URL("../components/command/YellowPrepStage.tsx", import.meta.url), "utf8");
const lead = readFileSync(new URL("../components/command/LeadStage.tsx", import.meta.url), "utf8");
const talk = readFileSync(new URL("../components/command/TalkStrip.tsx", import.meta.url), "utf8");
const oneMic = readFileSync(new URL("../components/command/OneMic.tsx", import.meta.url), "utf8");

test("orange estimate has no yellow crew, day, or lock controls", () => {
  assert.doesNotMatch(estimate, /Lock appointment/);
  assert.doesNotMatch(estimate, />Crew</);
  assert.doesNotMatch(estimate, />Day</);
  assert.doesNotMatch(estimate, /type="date"/);
  assert.doesNotMatch(estimate, /type="time"/);
  assert.doesNotMatch(estimate, /Save crew/);
  assert.doesNotMatch(estimate, /Dispatch notes/);
  assert.match(estimate, /Confirm this visit/);
  assert.match(estimate, /data-orange-walk/);
  assert.match(estimate, /pulseVisit \? " btn-next-action"/);
  assert.match(estimate, /pulse=\{pulseSend\}/);
});

test("yellow prep opens the jobs schedule and keeps materials", () => {
  assert.match(yellow, /Schedule Time/);
  assert.match(yellow, /onScheduleTime/);
  assert.match(yellow, /visit-when/);
  assert.match(yellow, /Crew assigned/);
  assert.match(yellow, /data-yellow-prep/);
  assert.match(yellow, /Dispatch notes/);
  assert.match(yellow, /Prep complete/);
  assert.doesNotMatch(yellow, /type="date"/);
  assert.doesNotMatch(yellow, /type="time"/);
  assert.doesNotMatch(yellow, /Save crew & schedule/);
  assert.doesNotMatch(yellow, /Days on site/);
  assert.doesNotMatch(yellow, /PrepStartCalendar/);
  assert.doesNotMatch(yellow, /FreeNumberInput/);
  assert.doesNotMatch(yellow, /readOnly/);
  assert.doesNotMatch(yellow, /type="number"/);
});

test("red lead stays free of visit booking", () => {
  assert.doesNotMatch(lead, /Lock appointment/);
  assert.doesNotMatch(lead, /Confirm this visit/);
  assert.doesNotMatch(lead, /type="date"/);
  assert.doesNotMatch(lead, /type="time"/);
  assert.match(lead, /canCall && !callLogged \? " btn-next-action"/);
  assert.match(lead, /callLogged \? " btn-next-action"/);
});

test("talk lives on ONE floating mic: types into the box, or opens the helper with confirm chips", () => {
  assert.match(oneMic, /data-one-mic/);
  assert.match(oneMic, /Typing into: \{typing\.name\}/);
  assert.match(oneMic, /Nothing saves until you confirm/);
  assert.match(oneMic, /pickVoiceTarget/);
  assert.match(oneMic, /useVoiceScope/);
  assert.match(oneMic, /createPortal/);
  // No other mic anywhere: no per-field mics, no “Hold to talk” bars, no “Hold the mic and say…” hints.
  for (const name of ["TalkStrip", "StageCoach", "StageFrame", "JobFolder", "FieldJob", "LeadStage", "CompanySetup", "ActiveStage", "InvoiceStage", "YellowPrepStage", "EstimateStage"]) {
    const src = readFileSync(new URL(`../components/command/${name}.tsx`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /<TalkStrip|HoldMic|talk-mic-btn|<Mic\b|voice\.listen\(/, name);
    assert.doesNotMatch(src, />\s*Hold to talk|Hold the mic —|Hold the mic and say/, name);
  }
  assert.doesNotMatch(talk, />Parse</);
  assert.doesNotMatch(talk, /Dictate/);
});

test("schedule hours are tap-to-edit rows with the same mic", () => {
  const schedule = readFileSync(new URL("../components/command/TimesheetBoard.tsx", import.meta.url), "utf8");
  assert.match(schedule, /data-crew-hours/);
  // One combined schedule (2026-10-02): jobs and estimates together, no Jobs/Estimates switch.
  assert.match(schedule, /sched-desk/);
  assert.doesNotMatch(schedule, /schedule-board|initialBoard/);
  assert.match(schedule, /Estimate/);
  assert.match(schedule, /jobStageMap/);
  assert.match(schedule, /CrewHoursList/);
  assert.match(schedule, /parseHoursTalk/);
  assert.match(schedule, /upsertHoursOffline/);
  assert.doesNotMatch(schedule, /from "@\/components\/ui\/dialog"/);
  // Spoken hours (“change Jordan’s hours to 6”) ride the one mic’s desk-wide scope.
  const deskHours = readFileSync(new URL("../components/command/DeskHoursScope.tsx", import.meta.url), "utf8");
  assert.match(deskHours, /parseHoursTalk/);
  assert.match(deskHours, /upsertHoursOffline/);
});

test("green active owns the live roster, hours, and crew page", () => {
  const active = readFileSync(new URL("../components/command/ActiveStage.tsx", import.meta.url), "utf8");
  const coach = readFileSync(new URL("../components/command/StageCoach.tsx", import.meta.url), "utf8");
  assert.match(active, /data-green-site/);
  assert.match(active, /parseVoiceActions/);
  assert.match(active, /useVoiceScope/);
  assert.match(active, /clockTodayOffline/);
  assert.match(active, /pageCrew/);
  assert.match(active, /Clock in on this job/);
  assert.match(active, /paintWindow/);
  assert.match(active, /Finish job → Invoice/);
  assert.match(active, /setJobPipeline/);
  // No hard locks (Eric, 2026-10-03): the user can finish whenever they want; the Guide suggests, never blocks.
  assert.doesNotMatch(active, /canOpenPipeStep\(5, filled\)/);
  assert.match(active, /updateJobOffline/);
  assert.match(active, /upsertHoursOffline/);
  // Crew phones never see money.
  assert.match(active, /const cost = office \? job\.cost : undefined/);
  assert.match(active, /\{office \? <span className="ja-amt">/);
  assert.match(active, /data-green-weather/);
  assert.match(active, /SiteMap/);
  assert.match(active, /SiteWeather/);
  assert.match(active, /useCrewPings/);
  assert.doesNotMatch(active, /from "@\/components\/command\/JobMap"/);
  assert.doesNotMatch(active, /directionsEmbedUrl/);
  assert.doesNotMatch(active, /type="date"/);
  assert.doesNotMatch(active, /Save crew & schedule/);
  assert.doesNotMatch(active, /Lock appointment/);
  assert.doesNotMatch(active, /data-orange-camera/);
  assert.doesNotMatch(active, /data-yellow-prep/);
  assert.doesNotMatch(estimate, /data-green-site/);
  assert.doesNotMatch(yellow, /data-green-site/);
  assert.doesNotMatch(lead, /data-green-site/);
  assert.doesNotMatch(estimate, /SiteMap|SiteWeather|data-green-weather/);
  assert.doesNotMatch(yellow, /SiteMap|SiteWeather|data-green-weather/);
  assert.doesNotMatch(lead, /SiteMap|SiteWeather|data-green-weather/);
  assert.match(coach, /useTalkScope/);
  assert.match(coach, /active: "Job board"/);
});

test("orange owns the camera on the visit card; red and yellow do not", () => {
  assert.match(estimate, /data-orange-camera/);
  assert.match(estimate, /Camera roll/);
  assert.match(estimate, /Scope of work/);
  assert.doesNotMatch(estimate, /<TalkStrip/);
  assert.doesNotMatch(estimate, /Hold to talk/);
  assert.match(talk, /data-orange-camera/);
  assert.doesNotMatch(lead, /ORANGE_VOICE_HELP/);
  assert.doesNotMatch(lead, /data-orange-camera/);
  assert.doesNotMatch(yellow, /ORANGE_VOICE_HELP/);
  assert.doesNotMatch(yellow, /data-orange-camera/);
});

test("stage cards keep lists above the dock and tappable over the mic pin", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const frame = readFileSync(new URL("../components/command/StageFrame.tsx", import.meta.url), "utf8");
  assert.match(css, /\.page\.docked\s*\{[^}]*padding-bottom:\s*calc\(8rem/);
  assert.match(css, /--bg-black:\s*#0d0d0d/i);
  assert.match(css, /--card-charcoal:\s*#1e1e1e/i);
  assert.match(css, /--card-border:\s*#333333/);
  assert.match(css, /--text-main:\s*#efefef/i);
  assert.match(css, /--text-muted:\s*#999999/);
  assert.match(css, /--font-sans:\s*var\(--font-inter\)/);
  assert.match(css, /letter-spacing:\s*-0\.2px/);
  assert.match(css, /\.command-card/);
  assert.match(css, /\.btn-outline/);
  assert.match(css, /\.pipeline-btn\.active-lead/);
  assert.match(css, /\.pipeline-btn\.active-appointment/);
  assert.match(css, /\.pipeline-btn\.active-navigate/);
  assert.match(css, /@keyframes taskPulse/);
  assert.match(css, /\.btn-next-action/);
  assert.match(css, /\.next-action-button/);
  assert.match(css, /--step-pulse/);
  assert.match(css, /--step-tint-rgb/);
  assert.match(css, /--tint-alpha/);
  assert.match(css, /taskPulse 4s infinite ease-in-out/);
  assert.match(css, /\.ghost-action,\s*\.btn-outline \{[^}]*background-color:\s*#ffffff/);
  assert.match(css, /\.btn-next-action,\s*\.next-action-button \{[^}]*background-color:\s*#c9a227/);
  assert.match(css, /\.btn-next-action,\s*\.next-action-button \{[^}]*color:\s*#0d0d0d/);
  assert.match(css, /\.btn-next-action,\s*\.next-action-button \{[^}]*border:\s*0/);
  assert.match(css, /0 0 0 5px var\(--step-pulse\)/);
  assert.match(css, /0 0 0 7px var\(--step-pulse\)/);
  assert.equal([...css.matchAll(/border:\s*4px solid var\(--step-pulse\)/g)].length, 0);
  assert.equal([...css.matchAll(/border:\s*2px solid var\(--step-pulse\)/g)].length, 0);
  assert.match(css, /\.add-form button\[type="submit"\] \{[^}]*background:\s*#ffffff/);
  assert.match(css, /\.est-send-sms,\s*\.est-send-mail \{[^}]*background:\s*#ffffff/);
  assert.match(css, /\.job-nav \{[^}]*background:\s*#ffffff/);
  assert.match(css, /\.field-cam-btn \{[^}]*background:\s*#ffffff/);
  assert.match(css, /\.lock-button \{[^}]*background:\s*#ffffff/);
  assert.doesNotMatch(css, /\.lock-button\.lime \{[^}]*taskPulse/);
  assert.doesNotMatch(css, /\.lead-advance \{[^}]*animation:\s*taskPulse/);
  assert.doesNotMatch(css, /\.lead-call,\s*\.btn-lead-red\.lead-call \{[^}]*animation:\s*taskPulse/);
  const pulseHits = [...css.matchAll(/animation:\s*taskPulse 4s infinite ease-in-out/g)];
  assert.equal(pulseHits.length, 3);
  assert.match(css, /\.choice-stack button\.on \{[^}]*border:\s*2px solid #0d0d0d/);
  assert.match(css, /\.pipeline-btn\.locked[^}]*pointer-events:\s*none/);
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /from "next\/font\/google"/);
  assert.match(layout, /variable:\s*"--font-inter"/);
  const payClient = readFileSync(new URL("../app/p/[token]/PayClient.tsx", import.meta.url), "utf8");
  // Client pay button: solid dark green + white type (was the pale lime lock-button; audit A09).
  const payCss = readFileSync(new URL("../app/p/[token]/pay.module.css", import.meta.url), "utf8");
  assert.match(payClient, /className=\{s\.payButton\}/);
  assert.match(payCss, /\.payButton \{[^}]*background:\s*#14532d[^}]*color:\s*#ffffff/);
  assert.match(payCss, /\.payButton \{[^}]*min-height:\s*60px/);
  assert.match(css, /\[data-shell="dark"\]/);
  assert.match(css, /\[data-shell="light"\]/);
  assert.match(css, /\[data-shell="color"\]/);
  assert.match(css, /\[data-shell="ink"\]/);
  assert.match(css, /\[data-wash="off"\]/);
  assert.match(css, /\[data-buttons="inverted"\]/);
  assert.match(css, /\[data-canvas="light"\]/);
  assert.match(css, /\[data-step="1"\]/);
  assert.match(css, /\[data-step="6"\]/);
  assert.match(css, /\[data-path="command"\]/);
  assert.match(css, /\[data-path="crew"\]/);
  assert.match(css, /\[data-path="estimate"\]/);
  assert.match(css, /\[data-path="company"\]/);
  assert.match(css, /\.lead-stage,\s*\.pipe-stage\s*\{[^}]*padding-bottom:\s*calc\(6rem \+ env\(safe-area-inset-bottom/);
  assert.match(css, /\.stage-ai-pin\s*\{[^}]*z-index:\s*1;/);
  assert.match(css, /\.stage-body\s*\{[^}]*z-index:\s*2;[^}]*padding(?:-bottom)?:[^;]*6rem \+ env\(safe-area-inset-bottom/);
  assert.match(css, /\.hours-desk\s*\{[^}]*padding-bottom:\s*calc\(6rem \+ env\(safe-area-inset-bottom/);
  assert.match(css, /\.command-cap\s*\{[^}]*padding-bottom:\s*calc\(6rem \+ env\(safe-area-inset-bottom/);
  assert.match(css, /\.job-folder\s*\{[^}]*padding-bottom:\s*calc\(6rem \+ env\(safe-area-inset-bottom/);
  assert.match(css, /\.site-weather\s*\{/);
  assert.match(css, /\.site-weather-hours\s*\{/);
  assert.match(css, /\.site-street\s*\{|\.site-map\s*\{/);
  assert.match(css, /\.map-toggle\s*\{/);
  assert.match(frame, /className="stage-body"/);
  assert.match(frame, /className="stage-ai-pin"/);
  assert.match(frame, /useStageDeckSwipe/);
  assert.match(frame, /axis="y"/);
});

test("dark green owns invoice, pay link, and the 1% split", () => {
  const invoice = readFileSync(new URL("../components/command/InvoiceStage.tsx", import.meta.url), "utf8");
  const coach = readFileSync(new URL("../components/command/StageCoach.tsx", import.meta.url), "utf8");
  const rail = readFileSync(new URL("../components/command/StageRail.tsx", import.meta.url), "utf8");
  assert.match(invoice, /data-dark-green/);
  assert.match(invoice, /data-invoice-tone/);
  assert.match(invoice, /sendInvoice/);
  assert.match(invoice, /splitInvoicePayment/);
  assert.match(invoice, /compileInvoiceLines/);
  assert.match(invoice, /Send pay link/);
  assert.match(invoice, /onHeard=\{locked \? undefined : hearInvoice\}/);
  assert.doesNotMatch(invoice, /data-green-site/);
  assert.doesNotMatch(invoice, /data-yellow-prep/);
  assert.doesNotMatch(invoice, /data-orange-camera/);
  assert.doesNotMatch(invoice, /Save crew & schedule/);
  assert.doesNotMatch(estimate, /data-dark-green/);
  assert.doesNotMatch(yellow, /data-dark-green/);
  assert.doesNotMatch(lead, /data-dark-green/);
  assert.match(coach, /invoice: "Invoice lines"/);
  assert.match(rail, /data-pay-tone/);
  assert.match(rail, /pipeline-btn/);
  assert.match(rail, /active-lead/);
  assert.match(rail, /active-appointment/);
  assert.match(rail, /active-navigate/);
  assert.match(rail, /next-action-button/);
  assert.match(rail, /btn-next-action/);
  assert.match(rail, /btn-outline/);
});

test("field employee home and company invites stay off the pipeline cards", () => {
  const home = readFileSync(new URL("../components/command/EmployeeHome.tsx", import.meta.url), "utf8");
  const timers = readFileSync(new URL("../components/command/ShiftTimers.tsx", import.meta.url), "utf8");
  const map = readFileSync(new URL("../components/command/SiteMap.tsx", import.meta.url), "utf8");
  const desk = readFileSync(new URL("../components/command/EmployeeWorkspace.tsx", import.meta.url), "utf8");
  const invite = readFileSync(new URL("../components/command/CrewInviteDesk.tsx", import.meta.url), "utf8");
  assert.match(home, /data-employee-home/);
  assert.match(home, /Clock in/);
  assert.match(home, /This week/);
  assert.match(home, /Shop \/ lead/);
  assert.match(home, /rollingSchedule/);
  assert.match(home, /10-day schedule/);
  assert.match(home, /ShiftTimers/);
  assert.match(home, /unpaidHours/);
  assert.match(home, /data-pre-shift/);
  assert.match(home, /Navigate/);
  assert.match(home, /Clock in/);
  assert.match(timers, /10-min break/);
  assert.match(timers, /30-min lunch/);
  assert.match(timers, /Notification/);
  assert.match(timers, /playCrewAlarm/);
  assert.match(timers, /data-crew-alarm/);
  assert.match(timers, /Pick alarm/);
  assert.match(desk, /useCrewBeacon/);
  assert.match(map, /map-toggle/);
  assert.match(map, /setMode\("street"\)/);
  assert.match(map, /setMode\("top"\)/);
  assert.match(map, /satelliteEmbedUrl/);
  assert.match(desk, /CrewInviteDesk/);
  assert.match(desk, /EmployeeHome/);
  assert.match(desk, /role === "CREW" \? "crew"/);
  assert.match(invite, /data-crew-invite/);
  assert.doesNotMatch(estimate, /data-employee-home/);
  assert.doesNotMatch(yellow, /data-employee-home/);
  assert.doesNotMatch(lead, /data-crew-invite/);
  assert.doesNotMatch(lead, /EmployeeOnboard/);
  assert.doesNotMatch(estimate, /EmployeeOnboard/);
  assert.doesNotMatch(yellow, /EmployeeOnboard/);
  assert.match(desk, /EmployeeOnboard/);
  assert.match(desk, /!employee\.onboardedAt/);
});

test("billing desk and answering lock live on Company, not the pipeline cards", () => {
  const desk = readFileSync(new URL("../components/command/EmployeeWorkspace.tsx", import.meta.url), "utf8");
  const billing = readFileSync(new URL("../components/command/BillingDesk.tsx", import.meta.url), "utf8");
  const setup = readFileSync(new URL("../components/command/CompanySetup.tsx", import.meta.url), "utf8");
  const invoice = readFileSync(new URL("../components/command/InvoiceStage.tsx", import.meta.url), "utf8");
  const active = readFileSync(new URL("../components/command/ActiveStage.tsx", import.meta.url), "utf8");
  assert.match(desk, /BillingDesk/);
  assert.match(desk, /data-addon-locked/);
  assert.match(billing, /data-billing-desk/);
  assert.match(billing, /AI answering service/);
  assert.match(billing, /Link bank account/);
  assert.match(setup, /data-addon-locked/);
  assert.match(setup, /\+\$59\/mo add-on/);
  assert.doesNotMatch(estimate, /data-billing-desk/);
  assert.doesNotMatch(yellow, /data-billing-desk/);
  assert.doesNotMatch(lead, /data-billing-desk/);
  assert.doesNotMatch(invoice, /data-billing-desk/);
  assert.doesNotMatch(active, /data-billing-desk/);
  assert.doesNotMatch(estimate, /startBillingCheckout/);
  assert.doesNotMatch(yellow, /startConnectOnboarding/);
  assert.match(desk, /stage=estimate/);
  assert.match(desk, /billing=verify/);
});

test("terms acceptance and legal links live on signup and Company, not pipeline cards", () => {
  const desk = readFileSync(new URL("../components/command/EmployeeWorkspace.tsx", import.meta.url), "utf8");
  const setup = readFileSync(new URL("../components/command/CompanySetup.tsx", import.meta.url), "utf8");
  const invoice = readFileSync(new URL("../components/command/InvoiceStage.tsx", import.meta.url), "utf8");
  assert.match(desk, /data-legal-links/);
  assert.match(desk, /href="\/terms"/);
  assert.match(desk, /href="\/privacy"/);
  assert.match(setup, /data-terms-accept/);
  assert.match(setup, /termsAccepted/);
  assert.match(setup, /I agree to the/);
  assert.match(setup, /Terms &amp; Conditions/);
  assert.match(setup, /Privacy Policy/);
  assert.doesNotMatch(estimate, /data-legal-links/);
  assert.doesNotMatch(yellow, /data-terms-accept/);
  assert.doesNotMatch(lead, /data-terms-accept/);
  assert.doesNotMatch(invoice, /data-legal-links/);
});

test("pipeline cards stay manually editable and speak with a male contractor voice", () => {
  const voice = readFileSync(new URL("../hooks/use-voice.ts", import.meta.url), "utf8");
  const profile = readFileSync(new URL("../lib/voice-profile.ts", import.meta.url), "utf8");
  const persona = readFileSync(new URL("../lib/ai-voice.ts", import.meta.url), "utf8");
  const invoice = readFileSync(new URL("../components/command/InvoiceStage.tsx", import.meta.url), "utf8");
  const active = readFileSync(new URL("../components/command/ActiveStage.tsx", import.meta.url), "utf8");
  // Company > AI voice: Male (default) / Female, most natural device voice, never a novelty robot.
  assert.match(voice, /pickSpeakingVoice\(synth\.getVoices\(\), gender\)/);
  assert.match(voice, /readVoiceGender\(\)/);
  assert.match(voice, /utterance\.pitch = NATURAL_TTS\.pitch/);
  assert.match(voice, /utterance\.rate = NATURAL_TTS\.rate/);
  assert.doesNotMatch(voice, /pitch = 0\.7/);
  assert.match(profile, /DEFAULT_VOICE_GENDER: VoiceGender = "male"/);
  assert.match(profile, /rate: 1\.0, pitch: 1\.0/);
  assert.match(profile, /isRobotVoice/);
  assert.match(profile, /v\.name\.includes\("Male"\)/);
  assert.match(profile, /v\.lang\.startsWith\("en"\)/);
  assert.match(persona, /SYSTEM: You are Job Command's lead AI assistant/);
  assert.match(persona, /seasoned, rugged male general contractor/);
  assert.match(persona, /How may I help you today/);
  assert.match(persona, /zero is allowed/);
  assert.match(estimate, /FreeNumberInput/);
  assert.match(invoice, /FreeNumberInput/);
  assert.match(yellow, /Dispatch notes/);
  assert.doesNotMatch(estimate, /type="number"/);
  assert.doesNotMatch(invoice, /type="number"/);
  assert.doesNotMatch(lead, /readOnly/);
  assert.doesNotMatch(active, /readOnly/);
  assert.doesNotMatch(invoice, /readOnly/);
  assert.match(oneMic, /Nothing saves until you confirm/);
});

test("job folder assigns crew inline and lockouts overlapping hours", () => {
  const folder = readFileSync(new URL("../components/command/JobFolder.tsx", import.meta.url), "utf8");
  const desk = readFileSync(new URL("../components/command/JobCrewSchedule.tsx", import.meta.url), "utf8");
  const actions = readFileSync(new URL("../app/actions.ts", import.meta.url), "utf8");
  const schedule = readFileSync(new URL("../components/command/TimesheetBoard.tsx", import.meta.url), "utf8");
  assert.match(folder, /JobCrewSchedule/);
  assert.doesNotMatch(folder, /SET CREW ON SCHEDULE/);
  assert.doesNotMatch(folder, /onOpenSchedule/);
  assert.match(desk, /data-job-crew-schedule/);
  assert.match(desk, /data-assign-crew/);
  assert.match(desk, /data-crew-pick/);
  assert.match(desk, /Busy/);
  assert.match(desk, /hour-step/);
  assert.match(yellow, /personBusyOnDates/);
  assert.match(yellow, /Schedule Time/);
  assert.doesNotMatch(estimate, /JobCrewSchedule/);
  assert.doesNotMatch(lead, /JobCrewSchedule/);
  assert.match(actions, /Pick another crew/);
  assert.match(schedule, /stop-num/);
  assert.match(schedule, /data-stop-hours/);
  assert.match(schedule, /monthDays/);
});
