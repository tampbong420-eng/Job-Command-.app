import assert from "node:assert/strict";
import test from "node:test";
import {
  ELEVENLABS_MALE_VOICE_ID,
  MALE_TTS,
  OPENAI_TTS_BLOCKED,
  OPENAI_TTS_VOICE,
  isBlockedTtsVoice,
  isFemaleTtsName,
  NATURAL_TTS,
  isRobotVoice,
  parseVoiceGender,
  pickMaleVoice,
  pickNaturalFemaleVoice,
  pickNaturalMaleVoice,
  pickSpeakingVoice,
  voiceGenderOf,
} from "./voice-profile";

test("TTS scans for Male/David/Mark/George/Guy and speaks at natural pitch 1.0", () => {
  assert.equal(OPENAI_TTS_VOICE, "onyx");
  assert.equal(MALE_TTS.voice, "onyx");
  assert.equal(MALE_TTS.pitch, 1.0);
  assert.equal(NATURAL_TTS.pitch, 1.0);
  assert.equal(NATURAL_TTS.rate, 1.0);
  assert.equal(MALE_TTS.rate, 1.0);
  assert.ok(ELEVENLABS_MALE_VOICE_ID.length > 8);
  assert.equal(isBlockedTtsVoice("alloy"), true);
  assert.equal(isBlockedTtsVoice("shimmer"), true);
  assert.ok(OPENAI_TTS_BLOCKED.includes("alloy"));
  const picked = pickMaleVoice([
    { name: "Samantha", lang: "en-US" },
    { name: "Google US English Female", lang: "en-US" },
    { name: "Microsoft David - English (United States)", lang: "en-US" },
    { name: "Kyoko", lang: "ja-JP" },
  ]);
  assert.equal(picked?.name, "Microsoft David - English (United States)");
  assert.equal(
    pickMaleVoice([
      { name: "Google UK English Male", lang: "en-GB" },
      { name: "Microsoft Zira", lang: "en-US" },
    ])?.name,
    "Google UK English Male"
  );
  assert.equal(
    pickMaleVoice([
      { name: "Microsoft Mark", lang: "en-US" },
      { name: "Samantha", lang: "en-US" },
    ])?.name,
    "Microsoft Mark"
  );
  assert.equal(
    pickMaleVoice([
      { name: "Microsoft George", lang: "en-GB" },
      { name: "Microsoft Guy Online (Natural) - English (United States)", lang: "en-US" },
    ])?.name,
    "Microsoft George"
  );
  assert.equal(
    pickMaleVoice([
      { name: "Samantha", lang: "en-US" },
      { name: "Kyoko", lang: "ja-JP" },
    ])?.name,
    "Samantha"
  );
  assert.equal(pickMaleVoice([{ name: "Kyoko", lang: "ja-JP" }]), undefined);
});

test("spoken copilot skips Samantha and prefers a natural male", () => {
  assert.equal(isFemaleTtsName("Samantha"), true);
  assert.equal(isFemaleTtsName("Google US English"), true);
  assert.equal(isFemaleTtsName("Microsoft Zira"), true);
  assert.equal(isFemaleTtsName("Microsoft Guy Online (Natural) - English (United States)"), false);
  assert.equal(isFemaleTtsName("Google UK English Male"), false);
  assert.equal(
    pickNaturalMaleVoice([
      { name: "Samantha", lang: "en-US" },
      { name: "Google US English", lang: "en-US" },
      { name: "Microsoft Guy Online (Natural) - English (United States)", lang: "en-US" },
      { name: "Microsoft George", lang: "en-GB" },
    ])?.name,
    "Microsoft Guy Online (Natural) - English (United States)"
  );
  assert.equal(
    pickNaturalMaleVoice([
      { name: "Samantha", lang: "en-US" },
      { name: "Microsoft Ryan", lang: "en-US" },
    ])?.name,
    "Microsoft Ryan"
  );
  assert.equal(
    pickNaturalMaleVoice([
      { name: "Google US English Female", lang: "en-US" },
      { name: "Google UK English Male", lang: "en-GB" },
    ])?.name,
    "Google UK English Male"
  );
  assert.equal(
    pickNaturalMaleVoice([
      { name: "Samantha", lang: "en-US" },
      { name: "Microsoft David - English (United States)", lang: "en-US" },
    ])?.name,
    "Microsoft David - English (United States)"
  );
  assert.equal(pickNaturalMaleVoice([{ name: "Samantha", lang: "en-US" }]), undefined);
});

const IPHONE = [
  { name: "Albert", lang: "en-US", voiceURI: "com.apple.speech.synthesis.voice.Albert" },
  { name: "Bad News", lang: "en-US", voiceURI: "com.apple.speech.synthesis.voice.BadNews" },
  { name: "Flo (English (US))", lang: "en-US", voiceURI: "com.apple.eloquence.en-US.Flo" },
  { name: "Fred", lang: "en-US", voiceURI: "com.apple.speech.synthesis.voice.Fred" },
  { name: "Aaron", lang: "en-US", voiceURI: "com.apple.ttsbundle.siri_Aaron_en-US_compact" },
  { name: "Samantha", lang: "en-US", voiceURI: "com.apple.voice.compact.en-US.Samantha" },
  { name: "Daniel", lang: "en-GB", voiceURI: "com.apple.voice.compact.en-GB.Daniel" },
  { name: "Evan (Enhanced)", lang: "en-US", voiceURI: "com.apple.voice.enhanced.en-US.Evan" },
  { name: "Ava (Premium)", lang: "en-US", voiceURI: "com.apple.voice.premium.en-US.Ava" },
  { name: "Zoe (Enhanced)", lang: "en-US", voiceURI: "com.apple.voice.enhanced.en-US.Zoe" },
];

const EDGE = [
  { name: "Microsoft David - English (United States)", lang: "en-US" },
  { name: "Microsoft Zira - English (United States)", lang: "en-US" },
  { name: "Microsoft Aria Online (Natural) - English (United States)", lang: "en-US" },
  { name: "Microsoft Guy Online (Natural) - English (United States)", lang: "en-US" },
  { name: "Microsoft Andrew Online (Natural) - English (United States)", lang: "en-US" },
  { name: "Microsoft Ava Online (Natural) - English (United States)", lang: "en-US" },
];

const CHROME = [
  { name: "Google US English", lang: "en-US" },
  { name: "Google UK English Female", lang: "en-GB" },
  { name: "Google UK English Male", lang: "en-GB" },
  { name: "Google Deutsch", lang: "de-DE" },
];

test("AI voice: natural male by default, natural female on request, never a robot", () => {
  assert.equal(parseVoiceGender(null), "male");
  assert.equal(parseVoiceGender("junk"), "male");
  assert.equal(parseVoiceGender("female"), "female");
  assert.equal(isRobotVoice(IPHONE[0]), true);
  assert.equal(isRobotVoice(IPHONE[2]), true);
  assert.equal(isRobotVoice(IPHONE[3]), true);
  assert.equal(isRobotVoice(IPHONE[4]), false);
  assert.equal(voiceGenderOf({ name: "Google US English", lang: "en-US" }), "female");
  assert.equal(voiceGenderOf({ name: "Evan (Enhanced)", lang: "en-US" }), "male");

  assert.equal(pickSpeakingVoice(IPHONE, "male")?.name, "Evan (Enhanced)");
  assert.equal(pickSpeakingVoice(IPHONE, "female")?.name, "Ava (Premium)");
  assert.equal(pickSpeakingVoice(IPHONE.slice(0, 7), "male")?.name, "Aaron");
  assert.equal(pickSpeakingVoice(IPHONE.slice(0, 4), "male"), undefined);

  assert.equal(pickSpeakingVoice(EDGE, "male")?.name, "Microsoft Andrew Online (Natural) - English (United States)");
  assert.equal(pickSpeakingVoice(EDGE, "female")?.name, "Microsoft Ava Online (Natural) - English (United States)");

  assert.equal(pickSpeakingVoice(CHROME, "male")?.name, "Google UK English Male");
  assert.equal(pickSpeakingVoice(CHROME, "female")?.name, "Google US English");
  assert.equal(pickNaturalFemaleVoice([{ name: "Microsoft David", lang: "en-US" }]), undefined);
  assert.equal(pickSpeakingVoice([{ name: "Samantha", lang: "en-US" }], "male")?.name, "Samantha");
});
