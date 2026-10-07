/** Route one spoken/typed line: parse the job, and open camera if they asked. */
export function wantsRollTalk(text: string) {
  return /\b(from roll|camera roll|photo roll|upload|gallery|album)\b/i.test(text);
}

export function wantsPhotoTalk(text: string) {
  return /\b(snap|photo|picture|pic|receipt|camera)\b/i.test(text);
}

export function routeVoiceTalk(
  text: string,
  actions: {
    parse: (text: string) => void;
    snap?: () => void;
    roll?: () => void;
  }
) {
  const cleaned = text.trim();
  if (!cleaned) return;
  if (wantsRollTalk(cleaned)) actions.roll?.();
  else if (wantsPhotoTalk(cleaned)) actions.snap?.();
  actions.parse(cleaned);
}
