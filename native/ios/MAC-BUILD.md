# Job Command — iPhone build on a Mac (step by step)

This box is Linux, so nothing here was compiled with Xcode. Everything that can be prepared without a Mac is
already in the repo:

| What | Where |
|---|---|
| App id `app.jobcommand.shop`, name **Job Command**, WebView → `https://jobcommand.app` | `capacitor.config.json` |
| App icon 1024×1024 + splash 2732×2732, made only from `public/job-command-logo.jpg` (crop/resize, no redraw) | `native/ios/assets/` (rebuild: `python3 native/ios/make-assets.py`) |
| Permission pop-up strings (mic, speech, camera, photos, location), export-compliance flag, app-bound domains | `native/ios/Info.plist.additions.plist` |
| Privacy manifest | `native/ios/PrivacyInfo.xcprivacy` |
| Screen-recording / app-switcher shield (Capacitor 6+ plugin + the view controller that registers it) | `native/ios/ScreenShieldPlugin.swift`, `native/ios/MainViewController.swift` |
| One script that wires all of the above into the Xcode project | `native/ios/apply-ios-config.sh` |

---

## A. What needs Eric's Apple Developer account

1. **Apple Developer Program** membership ($99/yr). Enroll as an **organization** (needs a D-U-N-S number) so
   the App Store shows the company as the seller, not Eric personally.
2. **Bundle ID** `app.jobcommand.shop` registered under Certificates, Identifiers & Profiles (Xcode can do it
   with automatic signing). If you want native push later: enable **Push Notifications** and make an APNs key.
3. **Signing**: Xcode › App target › Signing & Capabilities › Team = your team (automatic signing).
4. **App Store Connect app record**: name "Job Command" (must be free on the store), bundle id, SKU, primary
   language English (U.S.).
5. **App Privacy answers** (the "nutrition label") — match `PrivacyInfo.xcprivacy`: name, email, phone,
   address, precise location, photos, audio, other user content, payment info, other financial info, user
   id, device id; all *linked to the user*, *not tracking*, purpose *App Functionality*.
6. **URLs**: Privacy Policy `https://jobcommand.app/privacy`, Support URL (an email page or `/terms`). Support/contact email: `jobcommandofficial@gmail.com`.
7. **App Review notes + demo login**: a demo shop on the server the app points to, with the office PIN in the
   notes. Tell the reviewer where things are:
   - Account deletion: Office tab › Company › bottom › **Delete shop account** (crew: Roster › Profiles ›
     **Delete my login**).
   - AI permission: appears the first time voice/photos/notes would go to OpenAI; review in Company ›
     **AI & your data**.
8. **Agreements, Tax, and Banking** in App Store Connect (only needed for paid apps / in-app purchase).
9. **Storefronts / payments** — see "Decisions" at the bottom (Stripe subscriptions vs. Apple in-app purchase).
10. **Screenshots** for App Store Connect: iPhone 6.9" (1320×2868) — Apple scales them for smaller phones. iPad
    screenshots only if you leave iPad on.
11. Age rating questionnaire, export compliance (already answered "no non-exempt encryption" in Info.plist),
    content rights.

## B. One-time setup on the Mac

1. Install **Xcode** from the Mac App Store — the version Apple currently requires for uploads (Apple
   announces the minimum SDK each spring at developer.apple.com/news). Open it once and accept the license.
2. Install Node.js 20 LTS (`brew install node@20`) and CocoaPods (`brew install cocoapods`), or use Swift
   Package Manager (Capacitor 6+ default for new projects).
3. Get the code: copy this repo to the Mac (zip/USB/private git remote). Then:

```bash
cd job-command
npm install            # package.json already pins @capacitor/core, cli, ios, splash-screen,
                       # push-notifications and @capacitor-community/speech-recognition
npx cap add ios
bash native/ios/apply-ios-config.sh
npx cap open ios
```

4. In Xcode (the script prints these too):
   - Right-click the **App** folder › *Add Files to "App"…* › pick `PrivacyInfo.xcprivacy`,
     `ScreenShieldPlugin.swift`, and `MainViewController.swift` › tick target **App**.
   - Open `Main.storyboard`, select **Bridge View Controller**, Identity inspector › Custom Class =
     `MainViewController`, Module = `App`. (This registers the screen shield.)
   - App target › **General**: Display Name "Job Command", Version `1.0.0`, Build `1`.
     *Supported Destinations*: keep **iPhone** only (remove iPad/Mac) unless you want iPad review too.
   - **Signing & Capabilities**: Team = your Apple Developer team. Then **+ Capability › Push Notifications**
     (needed for alerts on iPhone; see section F).
5. Run on a real iPhone (cable or same Wi-Fi): pick the phone at the top of Xcode › ▶. Check:
   - Splash shows the Job Command logo, then the shop sign-in.
   - Tap the mic: iOS asks for the microphone (and speech) with the words from Info.plist.
   - Add a job photo: camera / photo library prompts.
   - Clock in as crew: location prompt.
   - Company › AI & your data, and Company › Delete shop account (do **not** run the delete on the real shop).

## C. Upload to TestFlight / App Store

1. Xcode › Product › **Archive** (destination "Any iOS Device (arm64)").
2. Organizer › **Distribute App** › App Store Connect › Upload.
3. App Store Connect › TestFlight: add yourself as an internal tester, install with the TestFlight app.
4. When it looks right: App Store tab › add screenshots, description, keywords, privacy answers, review notes,
   demo PIN › **Submit for Review**.

## D. No Mac? Cloud Mac options

- **Codemagic** (has a Capacitor/Ionic workflow; free minutes): connect the repo, add the App Store Connect API
  key (App Store Connect › Users and Access › Integrations › Keys), set the build script to
  `npm ci && npx cap add ios && bash native/ios/apply-ios-config.sh`,
  then the Xcode build + TestFlight publish steps. Codemagic still needs your Apple Developer account.
- **Ionic Appflow** (made by the Capacitor team), **Bitrise**, or **GitHub Actions macOS runners** — same idea.
- **MacinCloud / AWS EC2 Mac**: rent a remote Mac by the hour and follow section B by screen share.
  Note: adding the files to the Xcode target (step B4) needs Xcode's UI or a small `xcodeproj` script.

## E. Decisions for Eric before submitting

1. **Payments (guideline 3.1.1).** The app sells the $199/mo plan with Stripe. Apple requires in-app purchase
   for digital subscriptions bought *inside* an app. Since May 2025, apps on the **U.S. storefront** may link
   out to a web checkout (opened in Safari, not inside the app). Options: (a) ship U.S.-only and make sure
   Stripe checkout / card entry opens in Safari; (b) hide buying in the iPhone app ("manage your plan at
   jobcommand.app"); (c) add Apple in-app purchase. Check the current rules before submitting.
2. **Remote-website wrapper (guideline 4.2).** The app loads the live site in a WebView. Apple sometimes rejects
   apps that are "just a website". Native touches help: camera/mic/location prompts, the screen shield, and
   native push. Consider adding native push (`@capacitor/push-notifications`) before review.
3. **Logo resolution.** The original is 1024×558, so the 1024 icon is the shield scaled up ~2.4×. A larger
   original (2048 px+ or vector) would make a sharper icon. The original also has a small ✦ sparkle mark at the
   bottom right (it looks like an AI-image-generator watermark); the icon and splash crops leave it out.
4. **Web push** does not work inside an iPhone app WebView. Alerts on iPhone need native push (APNs key above).

## F. Voice and alerts inside the iPhone app (added Oct 2, 2026)

Two web features don't work inside an iPhone app's WebView, so the app switches to native code there.
The website and phone browsers are unchanged.

**One mic (voice → text).** iOS WebViews have no working Web Speech. When the app runs natively, the same
single mic button uses Apple's speech recognizer through `@capacitor-community/speech-recognition`
(`lib/native-speech.ts`, `lib/native-speech-engine.ts`, picked first in `components/command/OneMic.tsx`'s
`speechEngine()`; the web keeps `webkitSpeechRecognition`). Nothing to set up beyond `npm install` +
`npx cap sync ios`. iOS asks for Microphone and Speech Recognition the first time (strings already in
Info.plist). Apple limits one take to about a minute.

**Push alerts.** Web push doesn't exist in an app WebView. In the app, Alerts › turn on push uses
`@capacitor/push-notifications`: iOS asks, registers with Apple, and the phone's device token is saved by
`POST /api/push/native` (signed-in phones only; role comes from the session). Tokens are stored in the
existing `PushDevice` table as `native:ios:<token>` (no DB migration). Every alert that already goes to
web push also goes to these phones through Apple (APNs) — `lib/push-native.ts`.

What Eric needs to do (Apple account required):

1. Xcode › App target › Signing & Capabilities › **+ Capability › Push Notifications**.
2. developer.apple.com › Certificates, Identifiers & Profiles › **Keys › +** › tick *Apple Push Notifications
   service (APNs)* › download the `.p8` file (you can only download it once). Note the **Key ID** and your
   **Team ID** (top right of the developer site).
3. Set these on the server (Vercel › Project › Settings › Environment Variables), then redeploy:
   - `APNS_KEY_ID` = the Key ID
   - `APNS_TEAM_ID` = the Team ID
   - `APNS_PRIVATE_KEY` = the whole text of the `.p8` file (or `APNS_PRIVATE_KEY_BASE64` = it base64-encoded)
   - `APNS_BUNDLE_ID` = `app.jobcommand.shop` (default, only set it if the bundle id changes)
   - `APNS_ENV` = `development` only while testing a build run straight from Xcode; leave it unset for
     TestFlight and App Store builds.
4. On the phone: Alerts (top-right circle) › turn on push › Allow. Then make an alert happen (e.g. sign a
   test estimate) and check the phone buzzes. Tapping it opens that page in the app.

Until those env vars exist, native sends are skipped (the alert still lands in the in-app drawer). This
APNs sender was written and unit-tested here (token format, ES256 signature) but has **not** been tested
against Apple, because there's no key on this box. Android (FCM) is not wired yet.

Known gaps in the app shell: the shift timers' local "lunch is over" notification uses the web
Notification API, which the iPhone WebView doesn't have — it still vibrates/plays the alarm and shows the
in-app toast, but no lock-screen banner (would need `@capacitor/local-notifications`).
