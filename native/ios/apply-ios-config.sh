#!/bin/bash
# Run on the Mac, from the repo root, after `npx cap add ios` (see native/ios/MAC-BUILD.md).
# Merges Job Command's permission strings into Info.plist, adds the privacy manifest + ScreenShield
# plugin file, and builds the icon/splash set from native/ios/assets (made from Eric's logo).
set -euo pipefail
cd "$(dirname "$0")/../.."
PLIST=ios/App/App/Info.plist
PB=/usr/libexec/PlistBuddy
if [ ! -f "$PLIST" ]; then
  echo "No $PLIST yet. Run: npx cap add ios" >&2
  exit 1
fi
# PlistBuddy Merge never overwrites, so clear our keys first (Capacitor's template sets some of them).
for key in CFBundleDisplayName NSMicrophoneUsageDescription NSSpeechRecognitionUsageDescription \
  NSCameraUsageDescription NSPhotoLibraryUsageDescription NSPhotoLibraryAddUsageDescription NSLocationWhenInUseUsageDescription \
  ITSAppUsesNonExemptEncryption WKAppBoundDomains UISupportedInterfaceOrientations \
  "UISupportedInterfaceOrientations~ipad" UIUserInterfaceStyle; do
  $PB -c "Delete :$key" "$PLIST" >/dev/null 2>&1 || true
done
$PB -c "Merge native/ios/Info.plist.additions.plist" "$PLIST"
cp native/ios/PrivacyInfo.xcprivacy ios/App/App/PrivacyInfo.xcprivacy
cp native/ios/ScreenShieldPlugin.swift ios/App/App/ScreenShieldPlugin.swift
cp native/ios/MainViewController.swift ios/App/App/MainViewController.swift
npx --yes @capacitor/assets generate --ios --assetPath native/ios/assets
npx cap sync ios
echo
echo "Done. In Xcode (npx cap open ios):"
echo "  1. Right-click the App folder > Add Files to \"App\"… > PrivacyInfo.xcprivacy, ScreenShieldPlugin.swift, MainViewController.swift (tick target App)."
echo "     Main.storyboard > Bridge View Controller > Custom Class = MainViewController (Module App)."
echo "  2. App target > General > Supported Destinations: keep iPhone only (remove iPad) unless you want iPad review too."
echo "  3. Signing & Capabilities: pick your Team (Apple Developer account)."
