import { Capacitor } from '@capacitor/core';

/** True inside the Android and iOS apps, false in a web browser. */
export const isNativeApp = Capacitor.isNativePlatform();

declare global {
  interface Window {
    /** Added by the Windows program (desktop/preload.js). */
    smallMartDesktop?: { platform: string };
  }
}

/** True inside the Windows program. */
export const isDesktopApp = typeof window !== 'undefined' && !!window.smallMartDesktop;

/**
 * True when Google and Microsoft sign-in cannot work: both need an address a website provider accepts, which an
 * app's own window does not have. Email sign-in works everywhere.
 */
export const webSignInUnavailable = isNativeApp || isDesktopApp;
