# Native wrap (Capacitor)

Chrome and Safari cannot block OS screenshots. FLAG_SECURE / iOS screen shielding only work in a native shell. Job Command stays a Next.js server app; Capacitor loads the live site in a WebView.

## One-time wrap

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios
```

`capacitor.config.json` already points the WebView at `https://jobcommand.app`. Set `server.url` to your Vercel origin before a store build.

**iPhone:** follow `native/ios/MAC-BUILD.md` (icons/splash, Info.plist permission strings, privacy manifest, `apply-ios-config.sh`).

## Android screenshots

Replace the generated `MainActivity.java` with `native/android/MainActivity.java`. That sets `WindowManager.LayoutParams.FLAG_SECURE` so screenshots, recordings, and Recents show black instead of payroll, GPS, or invoices.

Optional: register `native/android/ScreenShieldPlugin.java` if you want JS to toggle the flag.

## iOS recordings and app switcher

Add `native/ios/ScreenShieldPlugin.swift` to the Xcode app target and register it as the `ScreenShield` Capacitor plugin. While a recording or AirPlay capture is active, the window is covered in black. The same cover hides the shop in the app switcher.

## Web

The browser shell still cannot stop a screenshot. Session cookies stay HttpOnly. APIs are rate-limited. Do not promise a black screen on Chrome or Safari.
