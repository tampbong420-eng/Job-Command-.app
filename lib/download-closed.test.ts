import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * The old /download/* route handed out the whole app: program, shop database, START.bat (App Store item).
 * It is gone for good. No route may answer /download/..., so Next.js answers 404.
 */
const root = path.resolve(new URL(".", import.meta.url).pathname, "..");
const app = path.join(root, "app");

function routeDirs(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    // Route groups "(x)" and parallel "@x" slots do not add a URL segment.
    const seg = /^\(.*\)$/.test(name) || name.startsWith("@") ? "" : `/${name}`;
    const next = `${rel}${seg}`;
    out.push(next, ...routeDirs(full, next));
  }
  return out;
}

test("/download/* has no route, so it 404s", () => {
  assert.equal(existsSync(path.join(app, "download")), false);
  const hits = routeDirs(app).filter((url) => /^\/download(\/|$)/.test(url) || /^\/\[[^/]+\](\/|$)/.test(url));
  assert.deepEqual(hits, [], `a route would still answer /download: ${hits.join(", ")}`);
});

test("nothing links to the old download files", () => {
  for (const file of ["components/command/EmployeeWorkspace.tsx", "app/page.tsx", "README.md", "public/sw.js", "middleware.ts"]) {
    const full = path.join(root, file);
    if (!existsSync(full)) continue;
    assert.doesNotMatch(readFileSync(full, "utf8"), /\/download\/Job-Command|Job-Command\.zip/, file);
  }
});
