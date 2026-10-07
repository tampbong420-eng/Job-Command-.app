export function appOrigin(request?: Request | { headers: Headers }) {
  const env = process.env.APP_ORIGIN?.replace(/\/$/, "");
  if (env) return env;
  if (request) {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (host) {
      const proto = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  }
  return "http://127.0.0.1:43123";
}

export function quoteUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/e/${encodeURIComponent(token)}`;
}

export function crewJoinUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/j/${encodeURIComponent(token)}`;
}
