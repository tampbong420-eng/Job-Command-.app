import "server-only";

export function stripeSecret() {
  return process.env.STRIPE_SECRET_KEY?.trim() || "";
}

export function stripeConfigured() {
  return Boolean(stripeSecret());
}

export function formBody(fields: Record<string, string>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value) body.set(key, value);
  }
  return body;
}

export async function stripeRequest(
  path: string,
  fields?: Record<string, string>,
  method: "GET" | "POST" = fields ? "POST" : "GET"
) {
  const secret = stripeSecret();
  if (!secret) throw new Error("Stripe is not configured.");
  const response = await fetch(`https://api.stripe.com/v1/${path.replace(/^\//, "")}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "GET" || !fields ? undefined : formBody(fields),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(payload.error?.message || `Stripe ${path} failed.`);
  }
  return payload;
}
