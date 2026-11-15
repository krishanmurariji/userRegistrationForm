import { Injectable } from '@angular/core';
import type { PublicClientApplication } from '@azure/msal-browser';
import { environment } from '../../environments/environment';
import { webSignInUnavailable } from './platform';

/** The parts of Google Identity Services this app uses. Loaded from Google at runtime. */
interface GoogleIdentity {
  initialize(options: { client_id: string; callback: (response: { credential?: string }) => void; ux_mode: 'popup' }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } };
  }
}

/**
 * Gets ID tokens from Google and Microsoft in the browser. The API verifies them and signs the user in.
 * Browser only: the Android and iOS apps use email sign-in until native Google and Microsoft sign-in is added.
 */
@Injectable({ providedIn: 'root' })
export class SocialAuthService {
  // Both sign-in pages work only in a browser: Google refuses to sign people in inside an app's embedded web view,
  // and the Microsoft sign-in window needs a browser too. The phone apps and the Windows program use email sign-in
  // until native sign-in is added.
  readonly googleEnabled = !!environment.googleClientId && !webSignInUnavailable;
  readonly microsoftEnabled = !!environment.microsoftClientId && !webSignInUnavailable;

  private googleScript: Promise<GoogleIdentity> | null = null;
  private msal: Promise<PublicClientApplication> | null = null;

  /** Draws Google's own sign-in button into the element and reports the ID token each time the user signs in. */
  async renderGoogleButton(element: HTMLElement, onToken: (idToken: string) => void): Promise<void> {
    const google = await this.loadGoogle();
    google.initialize({
      client_id: environment.googleClientId,
      ux_mode: 'popup',
      callback: (response) => {
        if (response.credential) onToken(response.credential);
      },
    });
    google.renderButton(element, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      logo_alignment: 'center',
      width: Math.min(400, Math.max(200, Math.floor(element.clientWidth))),
    });
  }

  /**
   * Opens Microsoft's sign-in window. Returns the ID token, or null when the attempt was abandoned:
   * the user closed the window, started another attempt, or took too long.
   *
   * The library cannot see the window being closed, so an abandoned attempt only ends when a new one
   * replaces it (overrideInteractionInProgress) or it times out. Callers must not block the UI on it.
   */
  async signInWithMicrosoft(): Promise<string | null> {
    const client = await this.loadMsal();
    try {
      const result = await client.loginPopup({
        scopes: ['openid', 'profile', 'email'],
        prompt: 'select_account',
        overrideInteractionInProgress: true,
      });
      return result.idToken;
    } catch (error) {
      const abandoned = ['user_cancelled', 'interaction_in_progress_cancelled', 'timed_out'];
      if (abandoned.includes((error as { errorCode?: string }).errorCode ?? '')) return null;
      throw error;
    }
  }

  private loadGoogle(): Promise<GoogleIdentity> {
    this.googleScript ??= new Promise<GoogleIdentity>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () =>
        window.google ? resolve(window.google.accounts.id) : reject(new Error('Google sign-in did not load.'));
      script.onerror = () => {
        this.googleScript = null; // allow a retry later
        reject(new Error('Google sign-in could not be loaded.'));
      };
      document.head.appendChild(script);
    });
    return this.googleScript;
  }

  private loadMsal(): Promise<PublicClientApplication> {
    this.msal ??= (async () => {
      // Loaded on demand so the Microsoft library is not part of the first page load.
      const { PublicClientApplication } = await import('@azure/msal-browser');
      const client = new PublicClientApplication({
        auth: {
          clientId: environment.microsoftClientId,
          authority: `https://login.microsoftonline.com/${environment.microsoftTenant}`,
          // Must be registered as a "Single-page application" redirect URI in the Entra app registration.
          redirectUri: `${window.location.origin}/msal-redirect`,
        },
        // Time allowed to finish signing in (password, verification code) in Microsoft's window.
        system: { popupBridgeTimeout: 5 * 60 * 1000 },
      });
      await client.initialize();
      return client;
    })();
    this.msal.catch(() => (this.msal = null));
    return this.msal;
  }
}
