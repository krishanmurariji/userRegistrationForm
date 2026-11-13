import { AfterViewInit, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonSpinner, IonText } from '@ionic/angular';
import { toApiError } from './api-error';
import { AuthService } from './auth.service';
import { SocialAuthService } from './social-auth.service';

/** "Continue with Google / Microsoft" buttons for the sign-in and sign-up pages. */
@Component({
  selector: 'app-social-buttons',
  imports: [IonButton, IonSpinner, IonText],
  template: `
    @if (social.googleEnabled || social.microsoftEnabled) {
      <div class="divider" aria-hidden="true"><span>or</span></div>
      @if (social.googleEnabled) {
        <div #google class="google"></div>
      }
      @if (social.microsoftEnabled) {
        <ion-button expand="block" fill="outline" color="dark" class="microsoft" [disabled]="busy()" (click)="microsoft()">
          @if (busy()) {
            <ion-spinner name="crescent" aria-label="Signing in" />
          } @else {
            <svg slot="start" width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" /><rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" /><rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            Continue with Microsoft
          }
        </ion-button>
      }
      @if (waiting()) {
        <ion-text color="medium" role="status">
          <p class="message">Finish signing in in the Microsoft window. Closed it? Tap the button to try again.</p>
        </ion-text>
      }
      @if (error(); as message) {
        <ion-text color="danger" role="alert"><p class="message">{{ message }}</p></ion-text>
      }
    }
  `,
  styles: `
    :host { display: block; margin-top: 20px; }
    .divider { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; color: var(--ion-color-medium); font-size: 0.9rem; }
    .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--ion-color-light-shade); }
    .google { display: flex; justify-content: center; min-height: 44px; margin-bottom: 12px; color-scheme: light; }
    .microsoft { text-transform: none; --border-width: 1px; }
    .microsoft svg { margin-right: 10px; }
    .message { margin: 12px 0 0; font-size: 0.95rem; }
  `,
})
export class SocialButtons implements AfterViewInit {
  protected readonly social = inject(SocialAuthService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly googleHost = viewChild<ElementRef<HTMLElement>>('google');

  protected readonly busy = signal(false);
  protected readonly waiting = signal(false);
  protected readonly error = signal('');
  private microsoftAttempt = 0;

  ngAfterViewInit(): void {
    const host = this.googleHost()?.nativeElement;
    if (!host) return;
    this.social
      .renderGoogleButton(host, (idToken) => void this.finish('google', idToken))
      .catch(() => host.remove()); // Google unreachable (offline, blocked): the other options still work.
  }

  /**
   * The button stays usable while Microsoft's window is open, because a closed window cannot be detected.
   * Tapping again starts a fresh attempt and cancels the earlier one.
   */
  protected async microsoft(): Promise<void> {
    if (this.busy()) return;
    const attempt = ++this.microsoftAttempt;
    this.waiting.set(true);
    this.error.set('');
    try {
      const idToken = await this.social.signInWithMicrosoft();
      if (attempt !== this.microsoftAttempt) return; // a newer attempt owns the screen now
      this.waiting.set(false);
      if (idToken) await this.finish('microsoft', idToken);
    } catch {
      if (attempt !== this.microsoftAttempt) return;
      this.waiting.set(false);
      this.error.set('Microsoft sign-in did not complete. Please try again.');
    }
  }

  private async finish(provider: 'google' | 'microsoft', idToken: string): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.externalLogin(provider, idToken);
      await this.router.navigateByUrl('/', { replaceUrl: true });
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
