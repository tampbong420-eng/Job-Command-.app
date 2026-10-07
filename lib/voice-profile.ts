/** Hardcoded deep male TTS. Scan Web Speech for Male / David / Mark / George / Guy. */

export const OPENAI_TTS_VOICE = "onyx" as const;
export const OPENAI_TTS_FALLBACK = "echo" as const;
export const OPENAI_TTS_BLOCKED = ["alloy", "shimmer", "nova", "fable", "coral"] as const;

/** ElevenLabs Adam — low, rugged male. */
export const ELEVENLABS_MALE_VOICE_ID = "pNInz6obpgDQGcFmaJgB";

export const MALE_TTS = {
  rate: 1.0,
  pitch: 1.0,
  lang: "en-US",
  voice: OPENAI_TTS_VOICE,
} as const;

const FEMALE_TTS_HINTS = [
  "female",
  "samantha",
  "zira",
  "aria",
  "salli",
  "jenny",
  "susan",
  "karen",
  "moira",
  "tessa",
  "victoria",
  "hazel",
  "kathy",
  "fiona",
  "princess",
];

export function isBlockedTtsVoice(name: string) {
  const raw = name.trim().toLowerCase();
  return OPENAI_TTS_BLOCKED.includes(raw as (typeof OPENAI_TTS_BLOCKED)[number]);
}

/** Skip Samantha, Zira, Aria, and other female / robotic defaults. */
export function isFemaleTtsName(name: string) {
  const n = name.toLowerCase();
  if (FEMALE_TTS_HINTS.some((hint) => n.includes(hint))) return true;
  if (n.includes("google us english") && !n.includes("male")) return true;
  return false;
}

/**
 * Forcefully look for a deep/male English voice profile.
 * Male / David / Mark / George / Guy, then first English voice.
 */
export function pickMaleVoice<T extends { name: string; lang: string }>(voices: T[]): T | undefined {
  const maleVoice =
    voices.find(
      (v) =>
        (v.name.includes("Male") ||
          v.name.includes("David") ||
          v.name.includes("Mark") ||
          v.name.includes("George") ||
          v.name.includes("Guy")) &&
        v.lang.startsWith("en")
    ) || voices.find((v) => v.lang.startsWith("en"));
  return maleVoice;
}

/**
 * Spoken copilot: most natural male English voice on this device, never Samantha, never a robot.
 * Edge "Online (Natural)" (Andrew, Brian, Guy, Christopher…) > Apple Premium > Enhanced (Evan, Nathan, Aaron, Tom)
 * > Google UK English Male > Siri > Windows desktop (Ryan, David, Mark, George).
 */
export function pickNaturalMaleVoice<T extends { name: string; lang: string; voiceURI?: string }>(
  voices: T[]
): T | undefined {
  return bestOf(voices, (v) => !isFemaleTtsName(v.name) && voiceGenderOf(v) === "male");
}

/* ------------------------------------------------------------------ */
/* AI voice: Male / Female. Device voices only (Web Speech API).      */
/* Natural first: Edge "Online (Natural)", Apple Premium/Enhanced,    */
/* Siri, Google network voices. Novelty / Eloquence robots are never  */
/* picked. Change the order here to change which voice wins.         */
/* ------------------------------------------------------------------ */

export type VoiceGender = "male" | "female";

export const VOICE_GENDER_KEY = "job_command_ai_voice";
export const VOICE_GENDER_EVENT = "job-command-ai-voice";
export const DEFAULT_VOICE_GENDER: VoiceGender = "male";

/** Natural voices sound best at their own pitch. 0.7 made them sound robotic. */
export const NATURAL_TTS = { rate: 1.0, pitch: 1.0, lang: "en-US" } as const;

/** Best first. Edge Online (Natural), then Apple / Siri, then Windows desktop. */
export const MALE_VOICE_NAMES = [
  "andrew", "brian", "guy", "christopher", "eric", "roger", "steffan", "davis", "ryan", "thomas", "william",
  "evan", "nathan", "aaron", "tom", "alex", "daniel", "arthur", "oliver", "gordon", "lee", "rishi",
  "david", "mark", "george", "james",
] as const;

export const FEMALE_VOICE_NAMES = [
  "ava", "emma", "jenny", "aria", "michelle", "sonia", "libby", "natasha",
  "zoe", "allison", "samantha", "susan", "serena", "nicky", "kate", "karen", "moira", "tessa", "fiona", "victoria",
  "zira", "hazel", "catherine",
] as const;

/** Apple novelty + Eloquence voices: the "robot" sound. Never pick these. */
const ROBOT_VOICE_NAMES = new Set([
  "albert", "bad news", "bahh", "bells", "boing", "bubbles", "cellos", "good news", "jester", "organ", "pipe organ",
  "superstar", "trinoids", "whisper", "wobble", "zarvox", "deranged", "hysterical", "fred", "junior", "ralph",
  "kathy", "princess", "eddy", "flo", "grandma", "grandpa", "reed", "rocko", "sandy", "shelley",
]);

type DeviceVoice = { name: string; lang: string; voiceURI?: string };

function baseName(voice: DeviceVoice) {
  return voice.name.toLowerCase().replace(/\s*\(.*$/, "").replace(/\s+-\s+.*$/, "").trim();
}

function words(voice: DeviceVoice) {
  return voice.name.toLowerCase().split(/[^a-z]+/).filter(Boolean);
}

export function isRobotVoice(voice: DeviceVoice) {
  const uri = (voice.voiceURI || "").toLowerCase();
  if (uri.includes("eloquence") || uri.includes("novelty")) return true;
  return ROBOT_VOICE_NAMES.has(baseName(voice));
}

export function voiceGenderOf(voice: DeviceVoice): VoiceGender | null {
  const w = words(voice);
  if (w.includes("female")) return "female";
  if (w.includes("male")) return "male";
  if (voice.name.toLowerCase().startsWith("google us english")) return "female";
  if (w.some((x) => (MALE_VOICE_NAMES as readonly string[]).includes(x))) return "male";
  if (w.some((x) => (FEMALE_VOICE_NAMES as readonly string[]).includes(x))) return "female";
  return null;
}

/** Higher = more natural. 0 = never. */
export function naturalScore(voice: DeviceVoice) {
  if (!voice.lang.toLowerCase().startsWith("en") || isRobotVoice(voice)) return 0;
  const name = voice.name.toLowerCase();
  const uri = (voice.voiceURI || "").toLowerCase();
  let score = 20;
  if (name.includes("natural")) score = 100;
  else if (name.includes("premium") || uri.includes(".premium.")) score = 90;
  else if (name.includes("enhanced") || uri.includes(".enhanced.")) score = 80;
  else if (name.startsWith("google ")) score = 70;
  else if (uri.includes("siri")) score = 60;
  else if (uri.startsWith("com.apple.") || uri.includes("ttsbundle")) score = 50;
  else if (name.startsWith("microsoft ")) score = 30;
  const lang = voice.lang.toLowerCase().replace("_", "-");
  if (lang === "en-us") score += 4;
  else if (lang === "en-gb") score += 2;
  const names = (voiceGenderOf(voice) === "female" ? FEMALE_VOICE_NAMES : MALE_VOICE_NAMES) as readonly string[];
  const rank = names.findIndex((n) => words(voice).includes(n));
  if (rank >= 0) score += (names.length - rank) / 100;
  return score;
}

function bestOf<T extends DeviceVoice>(voices: T[], keep: (v: T) => boolean): T | undefined {
  let best: T | undefined;
  let top = 0;
  for (const v of voices) {
    if (!keep(v)) continue;
    const s = naturalScore(v);
    if (s > top) {
      top = s;
      best = v;
    }
  }
  return best;
}

/** Most natural female English voice on this device. Never a robot. */
export function pickNaturalFemaleVoice<T extends DeviceVoice>(voices: T[]): T | undefined {
  return bestOf(voices, (v) => voiceGenderOf(v) === "female");
}

/**
 * The voice the app speaks with. Wanted gender first; if the device has none,
 * the most natural English voice it does have (still never a novelty robot).
 */
export function pickSpeakingVoice<T extends DeviceVoice>(voices: T[], gender: VoiceGender): T | undefined {
  const wanted = gender === "female" ? pickNaturalFemaleVoice(voices) : pickNaturalMaleVoice(voices);
  return wanted || bestOf(voices, (v) => voiceGenderOf(v) === null) || bestOf(voices, () => true);
}

export function parseVoiceGender(raw: string | null | undefined): VoiceGender {
  return raw === "female" ? "female" : DEFAULT_VOICE_GENDER;
}

export function readVoiceGender(): VoiceGender {
  if (typeof window === "undefined") return DEFAULT_VOICE_GENDER;
  try {
    return parseVoiceGender(window.localStorage.getItem(VOICE_GENDER_KEY));
  } catch {
    return DEFAULT_VOICE_GENDER;
  }
}

export function persistVoiceGender(gender: VoiceGender) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VOICE_GENDER_KEY, gender);
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event(VOICE_GENDER_EVENT));
}
