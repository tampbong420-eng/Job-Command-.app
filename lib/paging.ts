export function pagingBlockReason(
  selfOnClock: boolean,
  memberOnClock: boolean,
  memberName: string,
): string | null {
  if (!memberOnClock) {
    return `${memberName} is currently off the clock and cannot be reached via in-app paging.`;
  }
  if (!selfOnClock) {
    return "Clock in before paging crew through Job Command.";
  }
  return null;
}

export function canPageMember(
  selfOnClock: boolean,
  memberOnClock: boolean,
): boolean {
  return pagingBlockReason(selfOnClock, memberOnClock, "Crew") === null;
}
