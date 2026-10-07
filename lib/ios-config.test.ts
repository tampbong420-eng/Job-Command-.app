import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

/** PNG IHDR: width, height, color type (2 = RGB, 6 = RGBA). */
function pngInfo(rel: string) {
  const buf = readFileSync(new URL(rel, import.meta.url));
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
}

function plistString(xml: string, key: string) {
  const m = xml.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`));
  return m ? m[1] : "";
}

test("Capacitor iOS config: app id, display name, live site, safe scheme", () => {
  const cap = JSON.parse(read("../capacitor.config.json"));
  assert.equal(cap.appId, "app.jobcommand.shop");
  assert.equal(cap.appName, "Job Command");
  assert.match(cap.server.url, /^https:\/\//);
  assert.ok(!/^https?$/.test(cap.server.iosScheme || ""), "WKWebView cannot take http/https as a custom scheme");
  assert.equal(cap.ios.limitsNavigationsToAppBoundDomains, true);
});

test("Info.plist strings: every permission the app asks for has plain words", () => {
  const xml = read("../native/ios/Info.plist.additions.plist");
  for (const key of [
    "NSMicrophoneUsageDescription",
    "NSSpeechRecognitionUsageDescription",
    "NSCameraUsageDescription",
    "NSPhotoLibraryUsageDescription",
    "NSPhotoLibraryAddUsageDescription",
    "NSLocationWhenInUseUsageDescription",
  ]) {
    const words = plistString(xml, key);
    assert.ok(words.length > 40, `${key} needs a real sentence`);
    assert.match(words, /Job Command/);
  }
  assert.equal(plistString(xml, "CFBundleDisplayName"), "Job Command");
  // The Mac script clears every key before merging (PlistBuddy Merge never overwrites).
  const apply = read("../native/ios/apply-ios-config.sh");
  for (const key of [...xml.matchAll(/<key>(NS\w+UsageDescription)<\/key>/g)].map((m) => m[1])) {
    assert.match(apply, new RegExp(`\\b${key}\\b`), `apply-ios-config.sh must clear ${key}`);
  }
  assert.match(xml, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
  const host = new URL(JSON.parse(read("../capacitor.config.json")).server.url).host;
  assert.match(xml, new RegExp(`<string>${host.replace(".", "\\.")}</string>`), "app-bound domains must include the server host");
});

test("privacy manifest: no tracking, data types declared", () => {
  const xml = read("../native/ios/PrivacyInfo.xcprivacy");
  assert.match(xml, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  for (const type of ["PreciseLocation", "PhotosorVideos", "AudioData", "Name", "PhoneNumber", "PaymentInfo"]) {
    assert.match(xml, new RegExp(`NSPrivacyCollectedDataType${type}<`), type);
  }
  assert.doesNotMatch(xml, /<key>NSPrivacyCollectedDataTypeTracking<\/key><true\/>/);
});

test("icon and splash: right sizes, icon has no transparency", () => {
  const icon = pngInfo("../native/ios/assets/icon-only.png");
  assert.deepEqual([icon.width, icon.height], [1024, 1024]);
  assert.equal(icon.colorType, 2, "App Store icon must be opaque RGB");
  const splash = pngInfo("../native/ios/assets/splash.png");
  assert.deepEqual([splash.width, splash.height], [2732, 2732]);
  assert.match(read("../native/ios/make-assets.py"), /job-command-logo\.jpg/);
});

test("Mac build guide lists the Apple Developer account steps", () => {
  const doc = read("../native/ios/MAC-BUILD.md");
  for (const phrase of ["Apple Developer Program", "Bundle ID", "App Privacy", "demo", "Archive", "TestFlight"]) {
    assert.ok(doc.includes(phrase), phrase);
  }
});
