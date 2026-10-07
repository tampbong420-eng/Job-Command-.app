import assert from "node:assert/strict";
import test from "node:test";
import { keepPendingPhotos, photoBadge, shouldAutoFillEstimate, stripThumbs } from "./photo-cache";

test("photo badge stays a compact count", () => {
  assert.equal(photoBadge(0), "");
  assert.equal(photoBadge(1), "1 photo");
  assert.equal(photoBadge(4), "4 photos");
});

test("strip keeps four thumbs and an overflow count", () => {
  const photos = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(stripThumbs(photos, 4), { shown: [1, 2, 3, 4], extra: 2 });
  assert.deepEqual(stripThumbs([1, 2], 4), { shown: [1, 2], extra: 0 });
});

test("pending thumbs survive a stale empty server list", () => {
  const local = { id: "local:photo:1" };
  const uploaded = { id: "photo-server" };
  assert.deepEqual(keepPendingPhotos([], [local]), [local]);
  assert.deepEqual(keepPendingPhotos([], [uploaded], [local]), [uploaded, local]);
  assert.deepEqual(keepPendingPhotos([uploaded], [uploaded], [local]), [local, uploaded]);
});

test("auto-fill only rewrites a live draft", () => {
  assert.equal(shouldAutoFillEstimate(null), true);
  assert.equal(shouldAutoFillEstimate("DRAFT"), true);
  assert.equal(shouldAutoFillEstimate("CHANGES"), true);
  assert.equal(shouldAutoFillEstimate("SENT"), false);
  assert.equal(shouldAutoFillEstimate("ACCEPTED"), false);
});
