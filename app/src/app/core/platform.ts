import { Capacitor } from '@capacitor/core';

/** True inside the Android and iOS apps, false in a web browser. */
export const isNativeApp = Capacitor.isNativePlatform();
