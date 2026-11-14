import type { CapacitorConfig } from '@capacitor/cli';

/**
 * `CAP_DEV=1` is set by the `mobile:*:dev` scripts. It lets the app call a plain-http API on your own computer.
 * Release builds never set it, so they only talk to https.
 */
const dev = process.env['CAP_DEV'] === '1';

const config: CapacitorConfig = {
  appId: 'com.smallmart.app',
  appName: 'Small Mart',
  webDir: 'dist/app/browser',
  android: {
    // A test build on the emulator loads the app from https://localhost and calls an http API: allow that mix.
    allowMixedContent: dev,
  },
  server: {
    // The app is served from https://localhost on Android and capacitor://localhost on iOS. The API must allow
    // both origins (App:AllowedOrigins), see docs/MOBILE.md.
    androidScheme: 'https',
    cleartext: dev,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 700,
      backgroundColor: '#0b7a4b',
      showSpinner: false,
    },
    StatusBar: {
      // Light icons on the green header.
      style: 'DARK',
      backgroundColor: '#0b7a4b',
      overlaysWebView: false,
    },
    Keyboard: {
      // Shrinks the page when the keyboard opens, so the field being typed in stays visible.
      resize: 'body',
    },
  },
};

export default config;
