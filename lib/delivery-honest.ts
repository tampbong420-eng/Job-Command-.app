/** Client-safe. What to say after Send (go-public B4): never "sent" when nothing left because email/text aren't connected. */
type Channel = { ok?: boolean; mock?: boolean; notConnected?: boolean } | null | undefined;

export const NOT_SENT_LINE =
  "Email and text aren\u2019t connected yet, so nothing was sent. The client link is copied. Send it to your client yourself.";

export function sendOutcome(result: { email?: Channel; sms?: Channel } | null | undefined) {
  const used = [result?.email, result?.sms].filter(Boolean) as NonNullable<Channel>[];
  const fake = used.filter((row) => row.mock || row.notConnected);
  if (!used.length) return { sent: false, notConnected: false };
  return { sent: fake.length < used.length, notConnected: fake.length > 0 };
}

export function sendToast(result: { email?: Channel; sms?: Channel } | null | undefined, sentLine: string) {
  const outcome = sendOutcome(result);
  if (outcome.notConnected && !outcome.sent) return { kind: "message" as const, text: NOT_SENT_LINE };
  if (outcome.notConnected) return { kind: "success" as const, text: `${sentLine} (Part of it isn\u2019t connected yet, so only one way went out.)` };
  return { kind: "success" as const, text: sentLine };
}
