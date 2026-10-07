import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { hasNativePlugin } from "@/lib/native-app";
import { nativeSpeechAdapter, type NativeSpeechPlugin, type SpeechRecLike } from "@/lib/native-speech";

/** The native speech engine when running in the iPhone/Android app with the plugin installed, else null. */
export function nativeSpeechEngine(): SpeechRecLike | null {
  if (!hasNativePlugin("SpeechRecognition")) return null;
  return nativeSpeechAdapter(SpeechRecognition as unknown as NativeSpeechPlugin);
}
