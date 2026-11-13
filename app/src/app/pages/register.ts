import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent, IonInput, IonInputPasswordToggle, IonSpinner, IonText } from '@ionic/angular';
import { toApiError } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { SocialButtons } from '../core/social-buttons';

/** Mirrors the server's password rule: at least 8 characters with a lowercase letter and a digit. */
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*\d).{8,}$/;
export const PASSWORD_HINT = 'At least 8 characters, with a lowercase letter and a number';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, SocialButtons, IonContent, IonInput, IonInputPasswordToggle, IonButton, IonSpinner, IonText],
  template: `
    <ion-content class="ion-padding">
      <main class="auth-card">
        @if (sentTo(); as email) {
          <h1>Check your email</h1>
          <p class="lead" role="status">
            We sent a confirmation link to <strong>{{ email }}</strong>. Open it to finish creating your account.
          </p>
          <div class="links"><a routerLink="/login">Back to sign in</a></div>
        } @else {
          <h1>Create your account</h1>
          <p class="lead">Shop from local stores or open your own</p>

          <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <ion-input
              formControlName="fullName" type="text" autocomplete="name"
              label="Full name" labelPlacement="stacked" fill="outline"
              errorText="Enter your name" />
            <ion-input
              formControlName="email" type="email" inputmode="email" autocomplete="email"
              label="Email" labelPlacement="stacked" fill="outline"
              errorText="Enter a valid email address" />
            <ion-input
              formControlName="password" type="password" autocomplete="new-password"
              label="Password" labelPlacement="stacked" fill="outline"
              [helperText]="hint" [errorText]="hint">
              <ion-input-password-toggle slot="end" />
            </ion-input>

            @if (error(); as message) {
              <ion-text color="danger" role="alert"><p class="message">{{ message }}</p></ion-text>
            }

            <ion-button type="submit" expand="block" [disabled]="busy()">
              @if (busy()) { <ion-spinner name="crescent" aria-label="Creating account" /> } @else { Create account }
            </ion-button>
          </form>

          <app-social-buttons />

          <div class="links">
            <span>Already have an account? <a routerLink="/login">Sign in</a></span>
          </div>
        }
      </main>
    </ion-content>
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);

  protected readonly hint = PASSWORD_HINT;
  protected readonly form = inject(FormBuilder).nonNullable.group({
    fullName: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(200)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.pattern(PASSWORD_PATTERN), Validators.maxLength(128)]],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly sentTo = signal('');

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;

    this.busy.set(true);
    this.error.set('');
    try {
      const { fullName, email, password } = this.form.getRawValue();
      await this.auth.register(email.trim(), password, fullName.trim());
      this.sentTo.set(email.trim());
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
