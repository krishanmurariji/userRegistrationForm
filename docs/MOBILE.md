# Small Mart on Android and iOS

The Android and iOS apps are the same Angular and Ionic app as the website, wrapped with
[Capacitor](https://capacitorjs.com). The projects are in `app/android` and `app/ios`. Nearly everything is shared:
a change to the screens shows up in all three.

**Status:** the projects are set up and the web app builds into both. They have not been built or run on a phone
or simulator yet, because that needs Android Studio and, for iOS, a Mac with Xcode. Plan for a round of testing
and fixes on a real device (see "What to test first").

## What you need

| For | You need |
|---|---|
| Android | [Android Studio](https://developer.android.com/studio) (it brings its own Java). Any computer. |
| iOS | A Mac with Xcode 16 or newer. iOS apps cannot be built on Windows or Linux. |
| Both | Node.js 24.15 or newer, and the backend running (see the main README). |

No Android Studio or Mac? Use the automatic build below to get an Android file you can install.

## Try it on an Android emulator

1. Start the backend: `dotnet run --project src/SmallMart.Api --launch-profile http` (in `backend`).
2. In the `app` folder:

```bash
npm install
npm run mobile:android:dev
npm run open:android
```

3. Android Studio opens. Wait for it to finish syncing, then press the green Run button and pick an emulator.

The emulator reaches the API on your computer as `10.0.2.2` (see `src/environments/environment.android-dev.ts`).
For a **real phone** on the same Wi-Fi, put your computer's address in that file (for example
`http://192.168.1.20:5028`), start the API with `--urls http://0.0.0.0:5028`, and allow it through your firewall.

## Try it on an iPhone simulator

On a Mac, in the `app` folder:

```bash
npm install
npm run mobile:ios:dev
npm run open:ios
```

Xcode opens. Choose a simulator and press Run. The simulator can reach the API at `localhost:5028`.

## Get an installable Android file without Android Studio

Run the **Release** workflow on GitHub and download the Android file from the draft release. The steps are in
[RELEASING.md](RELEASING.md).

## Before publishing to the stores

1. **Host the backend** on a public https address. The apps call it over the internet. Put the real address in
   `app/src/environments/environment.ts` (`apiUrl`). The API already accepts requests from the apps
   (`https://localhost` on Android, `capacitor://localhost` on iOS). Uploaded pictures are stored in a folder on the
   server, so that folder must survive restarts (`Storage:Root`, `Storage:PrivateRoot`).
2. **Choose the app identity.** The app id is `com.smallmart.app` and the name is "Small Mart". To change them,
   edit `app/capacitor.config.ts` and also the `applicationId` in `app/android/app/build.gradle` and the bundle
   identifier in Xcode. An app id cannot be changed after the app is published.
3. **Replace the icon and splash screen.** They are placeholders drawn by a script. Put your own pictures in
   `app/assets` (`icon-only.png`, `icon-foreground.png`, `icon-background.png`, `splash.png`, `splash-dark.png`) and run
   `npm run mobile:assets`.
4. **Android:** `npm run mobile:android`, open the project, then Build, Generate Signed Bundle. Create a keystore and
   keep it and its password safe forever: losing it means you cannot update the app. Upload the `.aab` file to the
   Google Play Console (a one-time registration fee).
5. **iOS:** `npm run mobile:ios`, open the project in Xcode, set your team and signing, Product, Archive, then upload to
   App Store Connect and test with TestFlight (needs a paid Apple Developer account, yearly).
6. Both stores want a privacy policy address and screenshots. Apple also reviews how payments work: the app sells physical
   goods paid in cash or UPI outside the app, which is allowed, but say so in the review notes.

## What is not in the apps yet

- **Google and Microsoft sign-in** are hidden in the apps: Google refuses to sign people in inside an app's web view
  and Microsoft's sign-in window needs a browser. Customers use email and password. Native sign-in needs a plugin and
  a Google client id for each app. If Google sign-in is offered on iOS, Apple also requires "Sign in with Apple".
- **Push notifications** (news arrives in the app's list and bell, checked every 30 seconds while the app is open).
- **Secure storage:** the sign-in tokens are kept in the app's private storage. Moving them to the phone's keychain or
  keystore with a secure-storage plugin is recommended before launch.
- **Offline use:** the app needs an internet connection.
- **Deep links** (opening the app from a link in an email, for example the confirmation or password reset link).
  Those links open the website, which works, but not the app.

## What to test first on a real device

1. Sign up, confirm the email in a browser, then sign in in the app.
2. Add an item as a shop owner: the camera and the photo picker, and several pictures.
3. "Fill in from a photo" on the scan screen.
4. Place an order, then pay by UPI: does "Open UPI app" open GPay, PhonePe or Paytm with the amount filled in?
5. Attach a payment screenshot from the camera and from the gallery.
6. The back button on Android, the keyboard covering fields, the notch and the home bar on iPhone.
7. Rotate the phone and use dark mode.

## Useful commands (in `app`)

| Command | What it does |
|---|---|
| `npm run mobile:android` | Builds the app for release and copies it into the Android project |
| `npm run mobile:android:dev` | The same for the emulator and a local API |
| `npm run mobile:ios` / `mobile:ios:dev` | The same for iOS |
| `npm run open:android` / `open:ios` | Opens the project in Android Studio or Xcode |
| `npm run mobile:assets` | Regenerates the icons and splash screens from `app/assets` |

Every time you change the app's code, run the matching `mobile:` command again before running from Android Studio
or Xcode, so the native project has the latest version.
