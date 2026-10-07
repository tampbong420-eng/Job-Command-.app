import assert from "node:assert/strict";
import test from "node:test";
import { routeVoiceTalk, wantsPhotoTalk, wantsRollTalk } from "./talk-intent";

test("photo talk opens the camera, roll talk opens the gallery", () => {
  assert.equal(wantsPhotoTalk("snap a photo of the receipt"), true);
  assert.equal(wantsPhotoTalk("eight hours labor at 45"), false);
  assert.equal(wantsRollTalk("grab that from the camera roll"), true);
  assert.equal(wantsRollTalk("snap the fascia"), false);
});

test("one voice line parses and can fire snap or roll", () => {
  const calls: string[] = [];
  routeVoiceTalk("12 hrs labor at 45, snap a photo of the receipt", {
    parse: (text) => calls.push(`parse:${text}`),
    snap: () => calls.push("snap"),
    roll: () => calls.push("roll"),
  });
  assert.deepEqual(calls, [
    "snap",
    "parse:12 hrs labor at 45, snap a photo of the receipt",
  ]);
  calls.length = 0;
  routeVoiceTalk("upload the gallery shots", {
    parse: (text) => calls.push(`parse:${text}`),
    snap: () => calls.push("snap"),
    roll: () => calls.push("roll"),
  });
  assert.deepEqual(calls, ["roll", "parse:upload the gallery shots"]);
});
