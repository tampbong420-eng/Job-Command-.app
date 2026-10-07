import assert from "node:assert/strict";
import test from "node:test";
import {
  collapseTrail,
  mapResendType,
  mapTwilioStatus,
  pickChannels,
  shouldAdvance,
  trailToggleLabel,
} from "./delivery-log";

test("auto-routes every channel on file", () => {
  assert.deepEqual(pickChannels({ email: "a@b.co", phone: "5016232041" }), ["email", "sms"]);
  assert.deepEqual(pickChannels({ email: "a@b.co", phone: "" }), ["email"]);
  assert.deepEqual(pickChannels({ email: "", phone: "5016232041" }), ["sms"]);
  assert.deepEqual(pickChannels({ email: "", phone: "" }), []);
});

test("honors a requested subset when that channel exists", () => {
  assert.deepEqual(pickChannels({ email: "a@b.co", phone: "5016232041" }, ["sms"]), ["sms"]);
  assert.deepEqual(pickChannels({ email: "a@b.co", phone: "" }, ["sms"]), []);
  assert.deepEqual(pickChannels({ email: "a@b.co", phone: "5016232041" }, []), ["email", "sms"]);
});

test("receipts never roll a channel backwards", () => {
  assert.equal(shouldAdvance("sent", "delivered"), true);
  assert.equal(shouldAdvance("delivered", "sent"), false);
  assert.equal(shouldAdvance("opened", "viewed"), true);
  assert.equal(shouldAdvance(null, "queued"), true);
  assert.equal(shouldAdvance("delivered", "failed"), true);
});

test("maps Resend and Twilio provider statuses", () => {
  assert.equal(mapResendType("email.delivered"), "delivered");
  assert.equal(mapResendType("email.opened"), "opened");
  assert.equal(mapResendType("email.bounced"), "failed");
  assert.equal(mapResendType("email.clicked"), "opened");
  assert.equal(mapTwilioStatus("delivered"), "delivered");
  assert.equal(mapTwilioStatus("undelivered"), "failed");
  assert.equal(mapTwilioStatus("queued"), "queued");
});

test("collapses the client trail to latest status per channel", () => {
  const rows = collapseTrail(
    [
      { id: "1", estimateId: "e1", channel: "email", status: "sent", createdAt: "2026-09-16T14:00:00.000Z" },
      { id: "2", estimateId: "e1", channel: "email", status: "delivered", createdAt: "2026-09-16T14:00:04.000Z" },
      { id: "3", estimateId: "e1", channel: "sms", status: "sent", createdAt: "2026-09-16T14:00:01.000Z" },
      { id: "4", estimateId: "e1", channel: "link", status: "viewed", createdAt: "2026-09-16T18:12:00.000Z" },
    ],
    { e1: "EST-1002" }
  );
  assert.equal(rows.length, 3);
  assert.equal(rows[0].status, "viewed");
  assert.match(rows[0].line, /EST-1002 · Link · Viewed/);
  assert.equal(
    rows.find((row) => row.channel === "email")?.status,
    "delivered"
  );
  assert.match(trailToggleLabel(rows), /3 deliveries · viewed/);
});
