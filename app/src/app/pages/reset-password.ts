import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonInput, IonInputPasswordToggle, IonSpinner, IonText } from '@ionic/angular';
import { toApiError } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { PASSWORD_HINT, PASSWORD_PATTERN } from './register';

/** Opened from the link in the password reset email: /reset-password?userId=...&token=... */
@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink, IonContent, IonInput, IonInputPasswordToggle, IonButton, IonSpinner, IonText],
  template: `
    <ion-content class="ion-padding">
      <main class="auth-card">
        @if (done()) {
          <h1>Password changed</h1>
          <p class="lead" role="status">You can now sign in with your new password.</p>
          <div class="links"><a routerLink="/login">Sign in</a></div>
        } @else if (!userId || !token) {
          <h1>Link not valid</h1>
          <p class="lead" role="alert">This reset link is incomplete. Please request a new one.</p>
          <div class="links"><a routerLink="/forgot-password">Request a new link</a></div>
        } @else {
          <h1>Choose a new password</h1>
          <p class="lead">You will be signed out on your other devices.</p>

          <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <ion-input
              formControlName="password" type="password" autocomplete="new-password"
              label="New password" labelPlacement="stacked" fill="outline"
              [helperText]="hint" [errorText]="hint">
              <ion-input-password-toggle slot="end" />
            </ion-input>

            @if (error(); as message) {
              <ion-text color="danger" role="alert"><p class="message">{{ message }}</p></ion-text>
            }

            <ion-button type="submit" expand="block" [disabled]="busy()">
              @if (busy()) { <ion-spinner name="crescent" aria-label="Saving" /> } @else { Change password }
            </ion-button>
          </form>
          <div class="links"><a routerLink="/forgot-password">Request a new link</a></div>
        }
      </main>
    </ion-content>
  `,
})
export class ResetPasswordPage {
  private readonly auth = inject(AuthService);
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;

  protected readonly userId = this.query.get('userId');
  protected readonly token = this.query.get('token');
  protected readonly hint = PASSWORD_HINT;
  protected readonly form = inject(FormBuilder).nonNullable.group({
    password: ['', [Validators.required, Validators.pattern(PASSWORD_PATTERN), Validators.maxLength(128)]],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly done = signal(false);

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy() || !this.userId || !this.token) return;

    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.resetPassword(this.userId, this.token, this.form.getRawValue().password);
      this.done.set(true);
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
