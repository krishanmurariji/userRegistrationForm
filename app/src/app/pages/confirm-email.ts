import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent, IonSpinner } from '@ionic/angular';
import { toApiError } from '../core/api-error';
import { AuthService } from '../core/auth.service';

/** Opened from the link in the confirmation email: /confirm-email?userId=...&token=... */
@Component({
  selector: 'app-confirm-email',
  imports: [RouterLink, IonContent, IonSpinner],
  template: `
    <ion-content class="ion-padding">
      <main class="auth-card">
        @switch (state()) {
          @case ('working') {
            <h1>Confirming your email</h1>
            <ion-spinner name="crescent" aria-label="Please wait" />
          }
          @case ('done') {
            <h1>Email confirmed</h1>
            <p class="lead" role="status">Your account is ready. You can now sign in.</p>
          }
          @case ('failed') {
            <h1>Link not valid</h1>
            <p class="lead" role="alert">{{ error() }}</p>
            <p class="lead">Sign in to request a new confirmation email.</p>
          }
        }
        <div class="links"><a routerLink="/login">Go to sign in</a></div>
      </main>
    </ion-content>
  `,
})
export class ConfirmEmailPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;

  protected readonly state = signal<'working' | 'done' | 'failed'>('working');
  protected readonly error = signal('');

  async ngOnInit(): Promise<void> {
    const userId = this.query.get('userId');
    const token = this.query.get('token');
    if (!userId || !token) {
      this.error.set('This confirmation link is incomplete.');
      this.state.set('failed');
      return;
    }
    try {
      await this.auth.confirmEmail(userId, token);
      this.state.set('done');
    } catch (e) {
      this.error.set(toApiError(e).message);
      this.state.set('failed');
    }
  }
}
