# Publishing Small Mart on Google Play and Samsung Galaxy Store

Everything the stores ask for is ready in this repository except the steps only you can do (paying, signing in,
creating the signing key). Work through this page top to bottom.

| Store | Cost | Waiting time before going live |
|---|---|---|
| Google Play | US$25 once | Personal account: a 14-day closed test with 12 testers, then review (1 to 7 days). Organization account: review only. |
| Samsung Galaxy Store | Free | Review, usually a few days |

## 1. What is already done

| Requirement | Where |
|---|---|
| Target Android 16 (API 36) | `app/android/variables.gradle` |
| Delete account inside the app | Account → Delete account |
| Delete account on the web (Play asks for this link) | `https://userregistrationform.pages.dev/delete-account` |
| Privacy policy link | `https://userregistrationform.pages.dev/privacy` |
| App icon 512 × 512 | `docs/store/icon-512.png` |
| Feature graphic 1024 × 500 (Play only) | `docs/store/feature-graphic.png` |
| Phone screenshots 1080 × 1920 | `docs/store/screenshot-1.png` … `screenshot-6.png` |
| Signed `.aab` (Play) and signed `.apk` (Samsung) | Built by the **Release** workflow once the signing key secrets exist (step 3) |

Before publishing, set `supportEmail` in `app/src/environments/environment.ts` to the address people can write to
about their data. The privacy policy and delete-account pages show it. Then redeploy the website.

## 2. Package name

The app ID is `com.smallmart.app`. **It can never change after the first upload.** If Play says it is taken,
change `applicationId` in `app/android/app/build.gradle` and `appId` in `app/capacitor.config.ts` (for example to
`com.yourname.smallmart`) before uploading.

## 3. Create the signing key (once, keep it forever)

Do this on **your own computer**, so the key never leaves your hands. It needs Java's `keytool` (Android Studio
includes it, or install a JDK: `winget install EclipseAdoptium.Temurin.21.JDK`).

**Windows** (PowerShell, in the repository folder):

```powershell
powershell -ExecutionPolicy Bypass -File tools\signing\New-SigningKey.ps1
```

**macOS or Linux:**

```bash
bash tools/signing/new-signing-key.sh
```

The script asks for a password, creates `smallmart-upload.jks` in `Documents\SmallMart-Signing` (outside the
repository) and prints its SHA-1 and SHA-256 fingerprints. If the GitHub CLI (`gh`) is installed and signed in, it also
saves the four secrets below. Otherwise it tells you what to paste at GitHub → Settings → Secrets and variables →
Actions:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the contents of `keystore-base64.txt` (delete that file afterwards) |
| `ANDROID_KEYSTORE_PASSWORD` | your password |
| `ANDROID_KEY_ALIAS` | `smallmart` |
| `ANDROID_KEY_PASSWORD` | the same password |

Back up `smallmart-upload.jks` and the password (for example in Google Drive). Do not commit it. Then run
**Release** again (Android only is enough). It now produces `SmallMart-Android-PlayStore.aab` and a signed
`SmallMart-Android.apk`. The run's summary page shows the certificate fingerprints, so you can check it used your key.

Play uses "Play App Signing": Google keeps the final key and your file is only the *upload* key, so a lost upload key
can be reset through Play support. Samsung uses your key directly, so for Samsung the file must never be lost.

## 4. Google Play

1. Create the account at <https://play.google.com/console/signup> and pay US$25.
   - **Personal:** needs your ID. New personal accounts must run a closed test (step 6) before going public.
   - **Organization:** needs a D-U-N-S number (free from Dun & Bradstreet, 1 to 4 weeks) and a registered business,
     for example a free **Udyam** registration at <https://udyamregistration.gov.in>. No closed test is needed, and the
     store shows the business name.
2. **Create app:** name `Small Mart`, default language English (India), App, Free.
3. **Store listing:** paste the texts from section 6 and upload the images from `docs/store/`.
4. **App content** (left menu, "Policy and programs"):
   - Privacy policy: `https://userregistrationform.pages.dev/privacy`
   - App access: "All or some functionality is restricted". Add a demo customer login for the reviewer, for
     example `priya@demo.local` / its password, once the demo data is seeded on the live server.
   - Ads: No ads.
   - Content rating: fill in the questionnaire (shopping app, no violence or mature content, users can't chat with
     each other). The result is usually "Everyone" / "3+".
   - Target audience: 18 and over (or 13 and over). Not for children.
   - Data safety: see section 7.
   - Government app: No. Financial features: none (UPI is paid in the customer's own UPI app). Health: No.
5. **Testing → Internal testing:** upload the `.aab`, add yourself as tester, and install it from the link to check it.
6. **Closed testing (personal accounts only):** create a closed track, upload the same `.aab`, and add testers.
   An easy way is to create a Google Group, add the group's email as the tester list, and share the opt-in link.
   You need **12 people opted in for 14 days in a row**. Friends and family with Android phones work. So do free
   tester-swap communities, where you test other developers' apps and they test yours.
7. **Production:** after the test (or straight away for an organization account), go to Production, upload the
   `.aab`, choose India (and any other countries), and send for review.

## 5. Samsung Galaxy Store (free)

1. Sign up at <https://seller.samsungapps.com> with a Samsung account. **The country of that Samsung account becomes
   the seller country and cannot be changed**, so use an Indian account. Choose an individual seller (a free app
   does not need the commercial seller application).
2. **Add New Application → Android**, default language English.
3. **Binary:** upload the signed `SmallMart-Android.apk` from the release (Samsung also accepts the `.aab`).
4. **App information:** use the same title, descriptions, icon (512 × 512) and screenshots as Play. The privacy policy
   URL is required here too.
5. **Country/Region:** India (add more if you like). **Price:** Free.
6. Add the demo login in "Comments to certification team", then submit. Samsung tests on real Galaxy phones, and
   the app is listed once it passes.

## 6. Listing text (copy and paste)

**App name (30 characters max)**

```
Small Mart: Local Kirana
```

**Short description (80 characters max)**

```
Order groceries from your neighbourhood shops. Pay cash or UPI. Track delivery.
```

**Full description**

```
Small Mart brings the kirana shops near you onto your phone.

FOR CUSTOMERS
• Browse local shops and every aisle: atta, dal, rice, dairy, snacks, personal care and more
• Clear prices with MRP and savings on every item
• Add to cart from one shop and check out in seconds
• Pay cash on delivery, or pay by UPI with any UPI app
• Follow your order live: placed, accepted, packed, out for delivery, delivered
• Get a notification at every step

FOR SHOP OWNERS
• Put your shop online in minutes, with your own logo and cover photo
• Add items by typing, by scanning the barcode, or by taking a photo of the shelf
• Manage stock and get low-stock alerts
• Accept, pack and deliver orders from one simple screen
• Check UPI payments before you hand over the order
• Open or close for orders with one tap

PRIVATE AND SIMPLE
• No ads
• Your phone number and address go only to the shop you order from
• Delete your account at any time from the app

Small Mart works on Android, iPhone, Windows and on the web.
```

**Category:** Shopping. **Tags:** Grocery, Shopping, Local business.

## 7. Data safety answers

Data is encrypted in transit: **Yes**. Users can request deletion: **Yes** (link:
`https://userregistrationform.pages.dev/delete-account`). Data shared with third parties: **No** (the services that
run the app for us count as "service providers", not sharing).

| Data type | Collected | Optional? | Purpose |
|---|---|---|---|
| Personal info → Name | Yes | Required | App functionality, Account management |
| Personal info → Email address | Yes | Required | App functionality, Account management |
| Personal info → Phone number | Yes | Required for orders | App functionality |
| Personal info → Address | Yes | Required for orders | App functionality |
| Financial info → Purchase history | Yes | Required | App functionality |
| Financial info → Other (UPI reference, payment screenshot) | Yes | Optional | App functionality, Fraud prevention |
| Photos and videos → Photos | Yes | Optional | App functionality |
| App activity → Other actions (sign-ins) | Yes | Required | Fraud prevention, security and compliance |

Not collected: location, contacts, messages, files, calendar, health, device or other IDs, crash logs, web browsing.
Data is not processed only on the device (it is sent to our server), and none of it is used for ads or analytics.
