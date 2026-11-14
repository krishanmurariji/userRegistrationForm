# Small Mart app

Angular + Ionic + Capacitor. One codebase for the web app and, later, the Android and iOS apps.

## Run it

Start the API first (see the root README), then:

```bash
npm install
npm start
```

Open http://localhost:8100. The API address is set in `src/environments/`.

In development the API writes emails to its console instead of sending them, so copy the confirmation
or reset link from the API's log output.

## Layout

| Path | Purpose |
|---|---|
| `src/app/core/auth.service.ts` | Sign-in state, saved session, token refresh |
| `src/app/core/auth.interceptor.ts` | Adds the access token to API calls, refreshes it when expired |
| `src/app/core/auth.guard.ts` | Route guards for signed-in and signed-out pages |
| `src/app/core/shop.service.ts` | Shop, category and item API calls |
| `src/app/core/store.service.ts`, `cart.service.ts` | Customer browsing, orders and the cart (kept on the device) |
| `src/app/core/notification.service.ts`, `notification-bell.ts` | Unread count (checked every 30 seconds) and the header bell |
| `src/app/core/admin.service.ts` | Admin section API calls |
| `src/app/pages/` | Sign-in screens, home, shop page, shop form, categories, item form, account |
| `src/app/pages/admin/` | Admin section: overview, users, shops, activity, add shop owner |

## Not done yet

- Google and Microsoft sign-in work in the browser only. The Android and iOS apps use email sign-in.
- Android and iOS apps: set up but not yet run on a device. See [../docs/MOBILE.md](../docs/MOBILE.md).
- On phones the session is kept in the app's private storage. Moving it to the device keystore/keychain is
  recommended before launch.
