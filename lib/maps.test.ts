import assert from "node:assert/strict";
import test from "node:test";
import { satelliteEmbedUrl, streetViewEmbedUrl } from "./maps";

test("street view embed uses coordinates when present", () => {
  const url = streetViewEmbedUrl("3510 Albert Pike Rd", { lat: 34.5, lng: -93.05 }, "");
  assert.match(url, /cbll=34\.5,-93\.05/);
  assert.match(url, /svembed/);
});

test("top view embed is satellite, not a second directions map", () => {
  const url = satelliteEmbedUrl("3510 Albert Pike Rd", { lat: 34.5, lng: -93.05 }, "");
  assert.match(url, /t=k/);
  assert.doesNotMatch(url, /saddr=/);
  assert.doesNotMatch(url, /daddr=/);
});
