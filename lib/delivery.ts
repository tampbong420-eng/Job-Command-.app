import "server-only";

/**
 * mock = the provider key is missing, so NOTHING left the server (go-public B4). `ok` stays true only so the
 * job can move on with the client link the office sends by hand; every screen must say "not sent".
 */
export type DeliveryResult = { ok: boolean; mock: boolean; notConnected?: boolean; error?: string; id?: string };

export function emailConnected() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function smsConnected() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim() && process.env.TWILIO_FROM?.trim());
}

function e164(phone: string) {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  const only = digits.replace(/\D/g, "");
  if (only.length === 10) return `+1${only}`;
  if (only.length === 11 && only.startsWith("1")) return `+${only}`;
  return only ? `+${only}` : "";
}

function mockId(kind: "email" | "sms") {
  return `mock_${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<DeliveryResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim() || "Job Command <onboarding@resend.dev>";
  if (!key) {
    const id = mockId("email");
    console.info(`[delivery not connected — email NOT sent] id=${id} subject=${input.subject}`);
    return { ok: true, mock: true, notConnected: true, id };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok) {
      return { ok: false, mock: false, error: (payload.message || "Email failed.").slice(0, 280) };
    }
    return { ok: true, mock: false, id: typeof payload.id === "string" ? payload.id : "" };
  } catch (error) {
    return { ok: false, mock: false, error: error instanceof Error ? error.message : "Email failed." };
  }
}

export async function sendSms(input: {
  to: string;
  body: string;
  statusCallback?: string;
}): Promise<DeliveryResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM?.trim();
  const to = e164(input.to);
  if (!sid || !token || !from) {
    const id = mockId("sms");
    console.info(`[delivery not connected — text NOT sent] id=${id}`);
    return { ok: true, mock: true, notConnected: true, id };
  }
  if (!to) return { ok: false, mock: false, error: "Phone is not a valid number." };
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const body = new URLSearchParams({ To: to, From: from, Body: input.body });
    if (input.statusCallback) body.set("StatusCallback", input.statusCallback);
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const payload = (await response.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!response.ok) {
      return { ok: false, mock: false, error: (payload.message || "SMS failed.").slice(0, 280) };
    }
    return { ok: true, mock: false, id: typeof payload.sid === "string" ? payload.sid : "" };
  } catch (error) {
    return { ok: false, mock: false, error: error instanceof Error ? error.message : "SMS failed." };
  }
}
