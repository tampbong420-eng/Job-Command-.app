import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { COVER_PLACEHOLDERS, coverForJob, placeholderForJob } from "./job-cover";

const photo = (id: string, url: string) => ({ id, url, caption: "", createdAt: "2026-10-03" });

test("cover auto-picks the oldest job photo (the bid-time front shot)", () => {
  // Photos arrive newest-first, so the oldest (bid visit) is last.
  const cover = coverForJob({
    id: "job-1",
    photos: [photo("p3", "https://cdn/newest.jpg"), photo("p2", "https://cdn/mid.jpg"), photo("p1", "https://cdn/bid.jpg")],
  });
  assert.equal(cover.url, "https://cdn/bid.jpg");
  assert.equal(cover.isPhoto, true);
});

test("cover falls back to a mock house-front placeholder with no photos", () => {
  const a = coverForJob({ id: "job-9", photos: [] });
  const b = coverForJob({ id: "job-9", photos: [] });
  assert.equal(a.isPhoto, false);
  assert.equal(a.url, b.url, "placeholder is deterministic per job");
  assert.ok((COVER_PLACEHOLDERS as readonly string[]).includes(a.url));
  assert.equal(placeholderForJob("job-9"), a.url);
  // Every placeholder file actually ships with the app.
  for (const path of COVER_PLACEHOLDERS) {
    assert.ok(existsSync(new URL(`../public${path}`, import.meta.url)), `missing ${path}`);
  }
});

test("job card shows the client name above the cover with a tap-to-open gallery", () => {
  const card = readFileSync(new URL("../components/command/JobCard.tsx", import.meta.url), "utf8");
  const cover = readFileSync(new URL("../components/command/JobCover.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/ui-batch.css", import.meta.url), "utf8");
  // Active branch: client name header sits above the hero cover (Eric, 2026-10-03).
  const articleOpen = card.indexOf('className="job-card job-card-container command-card"');
  const headerOpen = card.indexOf("<header", articleOpen);
  const coverUse = card.indexOf("<JobCover", articleOpen);
  assert.ok(articleOpen > 0 && headerOpen > articleOpen && coverUse > headerOpen);
  assert.match(card, /<JobCover jobId=\{job\.id\} photos=\{job\.photos\} clientName=\{who\} hero \/>/);
  // Archived branch gets the small cover too (recognizable in archives).
  assert.match(card, /<JobCover jobId=\{job\.id\} photos=\{job\.photos\} clientName=\{who\} small \/>/);
  // Gallery: full-screen viewer with arrows, dots, close, keyboard support.
  assert.match(cover, /PhotoGallery/);
  assert.match(cover, /pg-arrow/);
  assert.match(cover, /pg-dots/);
  assert.match(cover, /aria-modal="true"/);
  assert.match(cover, /Escape/);
  // Placeholder is static (not a button) until real photos exist.
  assert.match(cover, /\$\{cls\} static/);
  assert.match(css, /\.job-cover/);
  assert.match(css, /\.photo-gallery/);
  assert.match(css, /\.pg-dots/);
});
