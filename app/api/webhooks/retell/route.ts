import { handleCallEvent } from "@/lib/answering/handlers";

// Retell call events (call_started, call_ended, call_analyzed). Public path (middleware lets /api/webhooks/* in);
// every request is checked against X-Retell-Signature before anything is read.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleCallEvent(request);
}
