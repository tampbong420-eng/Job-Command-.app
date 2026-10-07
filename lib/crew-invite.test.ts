import assert from "node:assert/strict";
import test from "node:test";
import { inviteHref, inviteShareText } from "./crew-invite";

test("invite links land on the field join page", () => {
  assert.equal(inviteHref("https://job.example", "abc_token"), "https://job.example/j/abc_token");
});

test("share copy names the person and the PIN rule", () => {
  const text = inviteShareText("Maya Chen", "https://job.example/j/abc");
  assert.match(text, /Maya Chen/);
  assert.match(text, /last four of your phone/);
  assert.match(text, /https:\/\/job\.example\/j\/abc/);
});
