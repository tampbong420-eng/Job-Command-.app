# Codemagic: build the Job Command iPhone app without a Mac

`codemagic.yaml` (repo root) builds the iPhone app on Codemagic's Mac and uploads it to **TestFlight**.
The website stays on Vercel. Codemagic never sends the app to App Store review (`submit_to_app_store: false`)
and never touches Stripe.

What one build does: install packages → run all tests, the iOS config test, typecheck and lint (stops if
anything fails) → check your Apple account (app record, app id, push) → create the iPhone project
(Capacitor + CocoaPods) and copy in the permission messages, privacy manifest, screen shield, icon and splash
→ wire the Xcode project (iPhone only, push hook) → signing (Codemagic makes the certificate and profile)
→ build number = latest on App Store Connect + 1 → build the `.ipa` → upload to TestFlight → email you.

Cost: free **Individual** plan (500 Mac minutes a month). One build is roughly 15–20 minutes, so about
25 builds a month. Builds start **only** when you press *Start new build* or push a tag like `ios-v1.0.0`,
never on every code push. Each build is capped at 45 minutes.

## Your steps (in order)

1. **Apple Developer Program** — enroll at developer.apple.com/programs ($99 a year). Enroll as an
   organization (needs a D-U-N-S number) if you want the store to show the company as the seller.
2. **Free Codemagic account** — sign up at codemagic.io with GitHub/GitLab/Bitbucket. Free Individual plan,
   no card needed.
3. **App record in App Store Connect** — appstoreconnect.apple.com › Apps › **+** › New App:
   platform iOS, name **Job Command**, language English (U.S.), bundle ID **app.jobcommand.shop**
   (register it first under developer.apple.com › Identifiers if it is not in the list), SKU e.g. `jobcommand-ios`.
   The build stops early with a clear message if this record is missing.
4. **Push Notifications on the bundle ID + APNs key** (for job alerts on the lock screen):
   - developer.apple.com › Certificates, Identifiers & Profiles › Identifiers › `app.jobcommand.shop` ›
     tick **Push Notifications** › Save. (The build also tries to turn this on itself; if it can't, it builds
     without push and says so.)
   - Keys › **+** › tick *Apple Push Notifications service (APNs)* › download the `.p8` (only once). Put
     `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` on **Vercel** (see `native/ios/MAC-BUILD.md` section F).
     This APNs key is a different key from the one in step 5.
5. **App Store Connect API key for Codemagic** — App Store Connect › Users and Access › Integrations ›
   App Store Connect API › **+** › name `Codemagic`, access **App Manager** › Generate › **Download** the
   `.p8` (only once). Write down the **Issuer ID** and **Key ID**.
   Then in Codemagic: Team settings › Team integrations › **Developer Portal** › Manage keys › Add key ›
   name it exactly **`Job Command ASC Key`** (the name in `codemagic.yaml`), paste Issuer ID and Key ID,
   upload the `.p8` › Save.
6. **Signing key (one time)** — Codemagic creates the Apple Distribution certificate from a private key you
   give it. On any Windows 10/11 PC (PowerShell) or Mac/Linux terminal run:
   `ssh-keygen -t rsa -b 2048 -m PEM -f ios_distribution_private_key -q -N ""`
   In Codemagic › the app › Environment variables: name `CERTIFICATE_PRIVATE_KEY`, value = the whole file
   (including the BEGIN/END lines), group **`ios_signing`**, tick **Secret** › Add. Keep a copy of the file
   somewhere safe; every future build uses the same key.
7. **Put the code on GitHub, GitLab or Bitbucket (private repo)** and in Codemagic › Add application › pick
   the repo › project type *Ionic Capacitor App* › it finds `codemagic.yaml`. This step needs your OK first;
   nothing has been pushed anywhere.
8. **Email** — done: `codemagic.yaml` sends build emails to `jobcommandofficial@gmail.com`.
9. **Start a build** — Codemagic › the app › **Start new build** › workflow *Job Command iPhone -> TestFlight*.
   (Or push a git tag like `ios-v1.0.0`.)
10. **Install with TestFlight** — when the build is green and Apple finishes processing (10–30 min):
    App Store Connect › the app › TestFlight › Internal Testing › add yourself › install the **TestFlight**
    app on your iPhone › open the invite. For crew/outside testers, also fill in TestFlight › Test Information
    (beta description, feedback email, demo login); Apple does a short beta review for them.

## App Review risks to know before submitting to the App Store (not done by this file)

- **Guideline 4.2 (just a website).** The app loads the live site `https://jobcommand.app` in a WebView
  (`capacitor.config.json` `server.url`); `webDir: public` is only a fallback. Apple rejects apps that are a
  repackaged website. What helps: native voice (Apple speech), native push, camera/photo/location prompts,
  the screen shield. Expect questions; describe these native parts in the review notes.
- **The app shows whatever jobcommand.app is serving.** The newest fixes (native mic, push sign-up, delete
  account, OpenAI permission) must be live on jobcommand.app before testing or review, or the app shows the
  old build.
- **Payments (guideline 3.1.1).** The $199/mo plan is sold with Stripe. Inside an iPhone app, digital
  subscriptions need Apple in-app purchase, except the U.S. storefront may link out to a web checkout in
  Safari. Decide before submitting (see MAC-BUILD.md section E).
- **Account deletion + demo login.** Review needs a demo shop and office PIN in the notes, and the in-app
  delete-account path (Office › Company › Delete shop account).
- **Privacy answers** in App Store Connect must match `native/ios/PrivacyInfo.xcprivacy`, and the privacy
  policy must name OpenAI (it does).

## Notes

- `ios/` is not in git; each build makes it fresh with `npx cap add ios --packagemanager CocoaPods`
  (the speech plugin has no Swift Package Manager support), then `native/ios/apply-ios-config.sh`.
- Capacitor 8 needs **Node 22** (the YAML uses Node 22; MAC-BUILD.md still says Node 20).
- The build adds the AppDelegate hook `@capacitor/push-notifications` needs on iOS; without it the phone
  never gets a push token. A manual Xcode build on a Mac needs the same hook.
- If signing fails with a "forbidden" error, give the API key the **Admin** role instead of App Manager.
  If it says you already have too many distribution certificates, revoke an old one at developer.apple.com.
