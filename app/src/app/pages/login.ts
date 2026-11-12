import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonInput, IonInputPasswordToggle, IonSpinner, IonText } from '@ionic/angular';
import { toApiError } from '../core/api-error';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, IonContent, IonInput, IonInputPasswordToggle, IonButton, IonSpinner, IonText],
  template: `
    <ion-content class="ion-padding">
      <main class="auth-card">
        <h1>Small Mart</h1>
        <p class="lead">Sign in to continue</p>

        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <ion-input
            formControlName="email" type="email" inputmode="email" autocomplete="email"
            label="Email" labelPlacement="stacked" fill="outline"
            errorText="Enter a valid email address" />
          <ion-input
            formControlName="password" type="password" autocomplete="current-password"
            label="Password" labelPlacement="stacked" fill="outline"
            errorText="Enter your password">
            <ion-input-password-toggle slot="end" />
          </ion-input>

          @if (error(); as message) {
            <ion-text color="danger" role="alert"><p class="message">{{ message }}</p></ion-text>
          }
          @if (notice(); as message) {
            <ion-text color="success" role="status"><p class="message">{{ message }}</p></ion-text>
          }
          @if (needsConfirmation()) {
            <ion-button fill="outline" expand="block" [disabled]="busy()" (click)="resend()">
              Send the confirmation email again
            </ion-button>
          }

          <ion-button type="submit" expand="block" [disabled]="busy()">
            @if (busy()) { <ion-spinner name="crescent" aria-label="Signing in" /> } @else { Sign in }
          </ion-button>
        </form>

        <div class="links">
          <a routerLink="/forgot-password">Forgot password?</a>
          <span>New here? <a routerLink="/register">Create an account</a></span>
        </div>
      </main>
    </ion-content>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly needsConfirmation = signal(false);

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;

    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.needsConfirmation.set(false);
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.login(email.trim(), password);
      await this.router.navigateByUrl(this.returnUrl(), { replaceUrl: true });
    } catch (e) {
      const { code, message } = toApiError(e);
      this.error.set(message);
      this.needsConfirmation.set(code === 'email_not_confirmed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async resend(): Promise<void> {
    this.busy.set(true);
    try {
      await this.auth.resendConfirmation(this.form.getRawValue().email.trim());
      this.error.set('');
      this.needsConfirmation.set(false);
      this.notice.set('Confirmation email sent. Please check your inbox.');
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  /** Only in-app paths are accepted, so a crafted link cannot send the user to another site after sign-in. */
  private returnUrl(): string {
    const url = this.route.snapshot.queryParamMap.get('returnUrl');
    return url && url.startsWith('/') && !url.startsWith('//') ? url : '/';
  }
}
