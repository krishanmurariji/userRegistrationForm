# Releasing Small Mart (Windows, Android, iOS)

One GitHub Actions workflow, `.github/workflows/release.yml`, tests the project, builds all three apps and puts
them in a **draft release**. Nothing is published until you press Publish.

**Status:** the workflow has not been run yet. The desktop tests and the web build pass locally, but the
Windows installer, the Android Gradle build and the iOS Xcode build could not be run in the development
environment. Expect to fix small things on the first run; send the log of any failed step.

## Run it

0. Deploy the API first: [DEPLOY.md](DEPLOY.md) (free). Its address is what goes in `api_url`.
1. The workflow must be on the `master` branch, or it does not show in the Actions tab.
2. Open the repository on GitHub, **Actions**, **Release**, **Run workflow**.
3. Fill in:
   - **version**: three numbers, for example `1.0.0`. It must not have been released before.
   - **api_url**: your hosted API, starting with `https://`. Or set it once as a repository variable `API_URL`
     (Settings, Secrets and variables, Actions, Variables). Without it the apps are built with a placeholder
     address, cannot sign in, and the release is marked pre-release.
   - Tick or untick Windows, Android, iOS, and whether to run the tests first.
4. When it finishes, open **Releases**, check the draft, then **Publish release**.

The first run can take 20 to 40 minutes. iOS uses macOS machines, which cost more of the free minutes.

## What you get

| Platform | Without secrets | With secrets |
|---|---|---|
| Windows | Installer, not signed (SmartScreen warning) | Signed installer |
| Android | Debug `.apk` for testing on a phone | Signed `.apk` and Play Store `.aab` |
| iOS | Unsigned `.ipa` for sideloading, and a simulator build (`.zip`) | Signed `.ipa` for TestFlight or the App Store |

## Installing the test builds

**Android (`...-android-debug.apk`):** copy it to the phone, open it, and allow "install unknown apps" when asked.
Each workflow run signs the debug build with a new key, so a newer debug APK cannot update an older one: uninstall
the old one first. Add the Android keystore secrets below to get builds that update each other.

**iPhone (`...-ios-unsigned.ipa`):** Apple only lets signed apps onto an iPhone. Without a paid developer account
(99 USD a year) the free way is to sideload it with **Sideloadly** (Windows or Mac) or **AltStore**: they sign the
`.ipa` with your own free Apple ID while installing. Limits of a free Apple ID: the app stops opening after 7 days
until you install it again, and at most 3 such apps per phone. Fine for testing; for real customers use a paid
account and TestFlight or the App Store.

## Optional secrets (Settings, Secrets and variables, Actions, Secrets)

**Android**: create a keystore once and keep it safe forever; losing it means you cannot update the app.
```bash
keytool -genkeypair -v -keystore release.keystore -alias smallmart -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.keystore
```
Secrets: `ANDROID_KEYSTORE_BASE64` (the base64 output), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD`.

**iOS** (needs a paid Apple Developer account): create a Distribution certificate and an App Store provisioning
profile for bundle id `com.smallmart.app`. Secrets: `IOS_CERTIFICATE_BASE64` (the `.p12`, base64),
`IOS_CERTIFICATE_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64`, `IOS_TEAM_ID`. Optional variable
`IOS_EXPORT_METHOD` (default `app-store-connect`; use `development` or `ad-hoc` with matching certificate and
profile). All three required iOS secrets must be present or the simulator build is made instead.

**Windows** (a code-signing certificate, bought from a certificate authority): `WINDOWS_CERTIFICATE_BASE64`
(the `.pfx`, base64) and `WINDOWS_CERTIFICATE_PASSWORD`.

Secrets are never printed in the logs and are not available to workflows from forks.

## Notes

- The Windows app is the same Angular app inside Electron (`desktop/`), served from a fixed `app://localhost`
  address that the API already allows. Google and Microsoft sign-in buttons are hidden in the Windows, Android
  and iOS apps for now; use email sign-in there.
- Try the desktop app locally: build the app (`cd app && npm run build`), then `cd desktop && npm ci && npm start`.
- Android version code is the workflow run number, so each release is higher than the last.
