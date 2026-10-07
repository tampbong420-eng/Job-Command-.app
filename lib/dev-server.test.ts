import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("dev live reload: 127.0.0.1 may open the HMR websocket", () => {
  const config = readFileSync(new URL("../next.config.mjs", import.meta.url), "utf8");
  const origins = config.match(/allowedDevOrigins:\s*\[([^\]]*)\]/);
  assert.ok(origins, "allowedDevOrigins is set");
  assert.match(origins![1], /"127\.0\.0\.1"/);
});

test("middleware skips every Next internal path", () => {
  const middleware = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  assert.match(middleware, /\(\?!_next\/\|/);
  assert.doesNotMatch(middleware, /_next\/static\|_next\/image/);
});
