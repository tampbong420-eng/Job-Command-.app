const CACHE = "job-command-shell-v31";
const SHELL = ["/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => undefined)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function bypass(request) {
  const url = new URL(request.url);
  if (request.method !== "GET") return true;
  if (url.origin !== self.location.origin) return true;
  if (request.mode === "navigate") return true;
  if (url.pathname.startsWith("/api/")) return true;
  if (url.pathname.startsWith("/_next/")) return true;
  if (url.pathname.includes("hot-update")) return true;
  if (url.searchParams.has("__nextjs_original-stack-frame")) return true;
  if (request.headers.get("next-action")) return true;
  if (request.headers.get("rsc") === "1") return true;
  if (request.headers.get("Next-Router-Prefetch")) return true;
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/html")) return true;
  if (accept.includes("text/x-component")) return true;
  return false;
}

function cacheable(request, response) {
  const cc = response.headers.get("cache-control") || "";
  if (/no-store|no-cache/i.test(cc)) return false;
  const url = new URL(request.url);
  return (
    url.pathname.startsWith("/avatars/") ||
    url.pathname.startsWith("/uploads/jobs/") ||
    url.pathname === "/icons/icon-192.png" ||
    url.pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (bypass(request)) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      try {
        const response = await fetch(request);
        if (response && response.ok && response.type !== "opaque" && cacheable(request, response)) {
          const cache = await caches.open(CACHE);
          void cache.put(request, response.clone());
        }
        return response;
      } catch {
        if (cached) return cached;
        return new Response("", { status: 503, statusText: "Offline" });
      }
    })()
  );
});

self.addEventListener("push", (event) => {
  // The server sends the shop's own title; the app name is only the fallback.
  let payload = { title: "Job Command", body: "", href: "/", id: "" };
  try {
    payload = { ...payload, ...(event.data ? event.data.json() : {}) };
  } catch {
    payload.body = event.data ? event.data.text() : "";
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "Job Command", {
      body: payload.body || "New update",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { href: payload.href || "/" },
      tag: payload.id || "job-command",
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => "focus" in client);
      if (existing) {
        if ("navigate" in existing && href) existing.navigate(href);
        return existing.focus();
      }
      return self.clients.openWindow(href);
    })
  );
});
