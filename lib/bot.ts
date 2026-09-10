export type BotContext = {
  isOnClock: boolean;
  jobTitle: string;
  jobAddress: string;
  supplies: string;
};

export function jobBotReply(userText: string, ctx: BotContext): string {
  const text = userText.toLowerCase();

  if (/\b(clock|shift|on the clock)\b/.test(text)) {
    return ctx.isOnClock
      ? "You are currently ON the clock. Crew paging is open for teammates who are also live."
      : "You are currently OFF the clock. Clock in from the dashboard tile before paging crew.";
  }

  if (/\b(job|address|northline|customer|where)\b/.test(text)) {
    return `${ctx.jobTitle} — ${ctx.jobAddress}. Open Today's Job for boss notes, supplies, and directions.`;
  }

  if (/\b(supply|supplies|paint|truck|equipment)\b/.test(text)) {
    return `Truck list: ${ctx.supplies}`;
  }

  return "Got it. I have logged that update for your crew tracking records.";
}
