// Is a cloud AI model reachable? A key (AI Gateway or OpenAI) locally, or Vercel's built-in OIDC token on a
// Vercel deployment (the AI SDK gateway provider picks that up by itself, no key needed). Every caller keeps its
// on-phone fallback in a try/catch, so a gateway error still answers with the local draft.
export function aiConfigured(env: Record<string, string | undefined> = process.env) {
  return Boolean(
    env.AI_GATEWAY_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || env.VERCEL_OIDC_TOKEN?.trim() || env.VERCEL === "1"
  );
}
