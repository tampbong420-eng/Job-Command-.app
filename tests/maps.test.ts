import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapsDirectionsUrl,
  mapsLiveTrackEmbedUrl,
  mapsStreetViewUrl,
} from "../lib/maps";
import type { CrewMember, Job } from "../lib/types";
import { weekdayHours } from "../lib/schedule";

const member: CrewMember = {
  id: "e-mike",
  name: "Mike Reyes",
  role: "HVAC Lead",
  phone: "",
  photoUrl: "",
  status: "active",
  currentJob: "Unit 4B",
  currentJobId: "c-northline",
  startedAt: null,
  weeklyHoursTarget: 40,
  weeklyHoursLogged: 4,
  weeklySchedule: weekdayHours("07:00", "16:00"),
  lat: 47.62482,
  lng: -122.3629,
  gpsLive: true,
};

const job: Job = {
  id: "c-northline",
  customerName: "Northline Properties",
  phone: "",
  address: "1847 W Mercer St, Seattle, WA 98119",
  jobTitle: "Unit 4B — HVAC replacement",
  status: "in_progress",
  scheduledTime: "08:30 AM",
  worker: "Mike Reyes",
  workerId: "e-mike",
  priority: "high",
  lat: 47.6246084,
  lng: -122.3635414,
};

test("mapsDirectionsUrl launches Google Maps navigation to the property", () => {
  const url = mapsDirectionsUrl(job, "47.62482,-122.3629");
  assert.equal(url.includes("https://www.google.com/maps/dir/"), true);
  assert.equal(url.includes("destination=47.6246084%2C-122.3635414"), true);
  assert.equal(url.includes("origin=47.62482%2C-122.3629"), true);
});

test("mapsStreetViewUrl opens a street view camera at the property", () => {
  assert.equal(
    mapsStreetViewUrl(job.lat ?? 0, job.lng ?? 0),
    "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=47.6246084,-122.3635414",
  );
});

test("mapsLiveTrackEmbedUrl plots crew to the active job", () => {
  const src = mapsLiveTrackEmbedUrl(member, job);
  assert.equal(src?.includes("saddr=47.62482,-122.3629"), true);
  assert.equal(src?.includes("daddr=47.6246084,-122.3635414"), true);
  assert.equal(src?.includes("output=embed"), true);
});
