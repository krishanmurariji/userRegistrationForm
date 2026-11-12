import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { Session } from './auth.models';

const KEY = 'smallmart.session';

/**
 * Keeps the signed-in session across app restarts.
 * Capacitor Preferences is localStorage on the web and app-private storage on Android and iOS.
 */
@Injectable({ providedIn: 'root' })
export class SessionStorage {
  async load(): Promise<Session | null> {
    const { value } = await Preferences.get({ key: KEY });
    if (!value) return null;
    try {
      return JSON.parse(value) as Session;
    } catch {
      return null;
    }
  }

  save(session: Session): Promise<void> {
    return Preferences.set({ key: KEY, value: JSON.stringify(session) });
  }

  clear(): Promise<void> {
    return Preferences.remove({ key: KEY });
  }
}
