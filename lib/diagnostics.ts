type Diagnostic = {
  at: string;
  source: "client" | "server";
  message: string;
  digest?: string;
};

const RING = 40;
const recent: Diagnostic[] = [];

function push(entry: Diagnostic) {
  recent.push(entry);
  if (recent.length > RING) recent.shift();
}

export function recentDiagnostics() {
  return recent.slice();
}

export function reportServerError(error: unknown, digest?: string) {
  const message = error instanceof Error ? error.message : String(error || "unknown");
  push({ at: new Date().toISOString(), source: "server", message, digest });
  console.error("[job-command]", message);
}

export function reportClientError(error: unknown, digest?: string) {
  const message = error instanceof Error ? error.message : String(error || "unknown");
  push({ at: new Date().toISOString(), source: "client", message, digest });
  if (typeof console !== "undefined") console.error("[job-command]", message);
}

let resets = 0;
let lastDigest = "";

export function shouldAutoReset(digest?: string) {
  const key = digest || "anon";
  if (key === lastDigest) resets += 1;
  else {
    lastDigest = key;
    resets = 1;
  }
  return resets <= 2;
}
