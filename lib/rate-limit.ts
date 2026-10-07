export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  reset: number;
  limit: number;
};

export type LimitRule = {
  bucket: string;
  limit: number;
  windowMs: number;
};

type Clock = () => number;

export function createRateLimiter(clock: Clock = () => Date.now()) {
  const hits = new Map<string, number[]>();

  function prune(now: number) {
    if (hits.size < 4000) return;
    for (const [key, stamps] of hits) {
      const fresh = stamps.filter((stamp) => now - stamp < 15 * 60_000);
      if (fresh.length) hits.set(key, fresh);
      else hits.delete(key);
    }
  }

  function consume(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = clock();
    prune(now);
    const start = now - windowMs;
    const stamps = (hits.get(key) || []).filter((stamp) => stamp > start);
    if (stamps.length >= limit) {
      return { ok: false, remaining: 0, reset: stamps[0] + windowMs, limit };
    }
    stamps.push(now);
    hits.set(key, stamps);
    return { ok: true, remaining: limit - stamps.length, reset: now + windowMs, limit };
  }

  return { consume, size: () => hits.size };
}

export const limiter = createRateLimiter();

export function clientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for") || "";
  const first = forwarded.split(",")[0]?.trim();
  return (
    first ||
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "local"
  );
}

export function ruleFor(pathname: string, method: string, isAction = false): LimitRule {
  const verb = method.toUpperCase();
  if (pathname === "/api/health" && verb === "GET") {
    return { bucket: "health", limit: 120, windowMs: 60_000 };
  }
  if (pathname.startsWith("/api/webhooks/")) {
    return { bucket: "webhook", limit: 300, windowMs: 60_000 };
  }
  if (pathname.startsWith("/api/cron/")) {
    return { bucket: "cron", limit: 30, windowMs: 60_000 };
  }
  if (pathname === "/api/session" && verb === "POST") {
    return { bucket: "pin", limit: 30, windowMs: 10 * 60_000 };
  }
  if (pathname === "/api/crew-ping") {
    return { bucket: "ping", limit: 90, windowMs: 60_000 };
  }
  if (pathname.startsWith("/api/")) {
    return { bucket: "api", limit: 120, windowMs: 60_000 };
  }
  if (isAction || verb === "POST") {
    return { bucket: "action", limit: 90, windowMs: 60_000 };
  }
  return { bucket: "page", limit: 180, windowMs: 60_000 };
}

export function rateLimitHeaders(result: RateLimitResult) {
  const retry = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(Math.max(0, result.remaining)),
    "X-RateLimit-Reset": String(Math.ceil(result.reset / 1000)),
    ...(result.ok ? {} : { "Retry-After": String(retry) }),
  };
}

export function hit(pathname: string, method: string, headers: Headers, isAction = false) {
  const rule = ruleFor(pathname, method, isAction);
  const ip = clientIp(headers);
  return limiter.consume(`${rule.bucket}:${ip}`, rule.limit, rule.windowMs);
}
