import { Component, OnInit, signal } from '@angular/core';
import { IonContent, IonSpinner } from '@ionic/angular';

/**
 * Microsoft sends its sign-in window back to this page. It hands the result to the page that opened the
 * window, which then closes it. Register this address (origin + /msal-redirect) in the Entra app registration.
 */
@Component({
  selector: 'app-msal-redirect',
  imports: [IonContent, IonSpinner],
  template: `
    <ion-content class="ion-padding">
      <main class="auth-card">
        @if (failed()) {
          <h1>Sign-in window</h1>
          <p class="lead" role="alert">Nothing to finish here. You can close this window and try again.</p>
        } @else {
          <h1>Finishing sign-in</h1>
          <ion-spinner name="crescent" aria-label="Please wait" />
        }
      </main>
    </ion-content>
  `,
})
export class MsalRedirectPage implements OnInit {
  protected readonly failed = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      const { broadcastResponseToMainFrame } = await import('@azure/msal-browser/redirect-bridge');
      await broadcastResponseToMainFrame();
    } catch {
      this.failed.set(true);
    }
  }
}
