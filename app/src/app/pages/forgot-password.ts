import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent, IonInput, IonSpinner, IonText } from '@ionic/angular';
import { toApiError } from '../core/api-error';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, IonContent, IonInput, IonButton, IonSpinner, IonText],
  template: `
    <ion-content class="ion-padding">
      <main class="auth-card">
        @if (sent()) {
          <h1>Check your email</h1>
          <p class="lead" role="status">
            If an account exists for that address, we sent a link to choose a new password.
          </p>
        } @else {
          <h1>Forgot your password?</h1>
          <p class="lead">Enter your email and we will send you a reset link.</p>

          <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <ion-input
              formControlName="email" type="email" inputmode="email" autocomplete="email"
              label="Email" labelPlacement="stacked" fill="outline"
              errorText="Enter a valid email address" />

            @if (error(); as message) {
              <ion-text color="danger" role="alert"><p class="message">{{ message }}</p></ion-text>
            }

            <ion-button type="submit" expand="block" [disabled]="busy()">
              @if (busy()) { <ion-spinner name="crescent" aria-label="Sending" /> } @else { Send reset link }
            </ion-button>
          </form>
        }
        <div class="links"><a routerLink="/login">Back to sign in</a></div>
      </main>
    </ion-content>
  `,
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthService);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly sent = signal(false);

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;

    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.forgotPassword(this.form.getRawValue().email.trim());
      this.sent.set(true);
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
