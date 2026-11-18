# New-order alerts and phone notifications

Shop owners never miss an order:

| When | What the owner sees |
|---|---|
| The app is open (phone, web, Windows) | A **full-screen alert** with the customer, total, payment, every item with the stock left after this order, and big **Accept** / **Decline** buttons. It chimes every few seconds and vibrates until the owner decides. "Decide later" hides it for 3 minutes and leaves a "1 order waiting" button on screen. |
| The Android app is closed or in the background | A **ringing notification** (it keeps ringing until it is looked at) with **Accept** and **Decline** buttons that work without opening the app. Tapping the notification opens the order. |
| The website or Windows app is in the background | A system notification (after the owner allows notifications once). |

A UPI order alerts the shop once the customer has sent the payment proof. Accepting it from the alert also confirms
the payment. Declining puts the stock back and tells the customer the reason.

The full-screen alert works with no setup. The Android notifications need Firebase Cloud Messaging, which is free.

## Set up Firebase (once, about 10 minutes)

1. Go to <https://console.firebase.google.com>, choose **Create a project**, name it `Small Mart`. Google Analytics is
   not needed. The free **Spark** plan is enough.
2. In the project, click the **Android** icon to add an app:
   - Package name: `com.smallmart.app` (the same as `applicationId` in `app/android/app/build.gradle`)
   - App nickname: `Small Mart`
   - SHA-1: optional. Paste the SHA-1 printed by the signing key script if you like.
   - Download **google-services.json**. Skip the remaining steps of the wizard (the code is already in place).
3. Save it as a GitHub secret named **`GOOGLE_SERVICES_JSON`**: open the file in Notepad, copy everything, and paste
   it as the secret's value (GitHub → Settings → Secrets and variables → Actions → New repository secret).
4. In Firebase, open **Project settings → Service accounts → Generate new private key**. A `.json` file downloads.
   Save its whole contents as a GitHub secret named **`FIREBASE_SERVICE_ACCOUNT_JSON`**. This one is a password: never
   commit it or share it. Delete the downloaded file once the secret is saved.
5. Run **Deploy API** (so the server can send pushes), then **Release** (so the Android app can receive them).
6. On the phone, sign in as the shop owner and allow notifications when Android asks.

To check it: close the app, place an order from another phone or the website, and the owner's phone should ring
within a few seconds.

## Notes

- iPhone notifications need an Apple Developer account (US$99/year) and are not set up. On iPhone the full-screen
  alert works while the app is open.
- The server keeps one Firebase token per phone and removes it on sign-out, so a shared phone only rings for whoever
  is signed in.
- The Accept and Decline buttons carry a signed code that only works for that order and that person, and expires
  after 6 hours.
