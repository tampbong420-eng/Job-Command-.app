import { handleInbound } from "@/lib/answering/handlers";

// Retell inbound-call webhook (set on the Retell number). Picks full AI vs message-only for the call and fills
// the agent's variables. Signature-checked.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleInbound(request);
}
