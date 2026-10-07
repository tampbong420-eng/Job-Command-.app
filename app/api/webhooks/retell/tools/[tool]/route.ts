import { handleTool } from "@/lib/answering/handlers";

// Retell custom functions: /tools/check_availability and /tools/book_estimate. Signature-checked.
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { tool: string } }) {
  return handleTool(request, params.tool);
}
