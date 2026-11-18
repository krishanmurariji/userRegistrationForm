import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonInput, IonInputPasswordToggle, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular';
import { environment } from '../../environments/environment';
import { toApiError } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { AppIcon } from '../core/icon';

/**
 * Deletes the signed-in account. It is also a public page (app stores ask for a web link where people can delete
 * their account), so when signed out it explains the steps and offers to sign in first.
 */
@Component({
  selector: 'app-delete-account',
  imports: [ReactiveFormsModule, RouterLink, AppIcon, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonInput, IonInputPasswordToggle, IonButton, IonSpinner],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button [defaultHref]="auth.isSignedIn() ? '/account' : '/welcome'" text="" /></ion-buttons>
        <ion-title>Delete account</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="shop-bg">
      <main class="shop-column narrow legal delete-page">
        @if (done()) {
          <section class="card ok-card admin-done" role="status">
            <span class="empty-art"><app-icon name="check-circle" weight="duotone" /></span>
            <h1>Your account is deleted</h1>
            <p>Your sign-in and personal details have been erased. Thank you for using Small Mart.</p>
            <ion-button expand="block" routerLink="/login">Done</ion-button>
          </section>
        } @else {
          <header class="legal-hero">
            <span class="hero-icon"><app-icon name="prohibit" weight="duotone" /></span>
            <h1>Delete your Small Mart account</h1>
            <p>This cannot be undone. If you only want a break, you can simply sign out.</p>
          </header>

          <section class="card">
            <h2><span class="head-icon bad"><app-icon name="x-circle" weight="duotone" /></span>What is deleted</h2>
            <ul>
              <li>Your sign-in: email, password and any Google or Microsoft link.</li>
              <li>Your name, and the phone numbers, addresses and notes on your orders.</li>
              <li>Your notifications.</li>
              <li>For shop owners: your access to your shops. A shop only you run goes offline.</li>
            </ul>
            <h2 class="kept"><span class="head-icon"><app-icon name="receipt" weight="duotone" /></span>What is kept</h2>
            <p>Past orders stay with the shop for its accounts and tax records, showing only “Deleted user”, the items and the amounts.</p>
          </section>

          @if (auth.isAdmin()) {
            <div class="card"><p>The platform admin account cannot be deleted from the app.</p></div>
          } @else if (auth.user(); as user) {
            <form class="card stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
              <h2><span class="head-icon bad"><app-icon name="lock-key" weight="duotone" /></span>Confirm it is you</h2>
              <p class="muted">Signed in as <strong>{{ user.email }}</strong></p>
              <ion-input formControlName="password" type="password" autocomplete="current-password" label="Password" labelPlacement="stacked" fill="outline"
                helperText="Signed up with Google or Microsoft? Leave this empty.">
                <ion-input-password-toggle slot="end" />
              </ion-input>
              <ion-input formControlName="confirm" label="Type DELETE to confirm" labelPlacement="stacked" fill="outline" autocapitalize="characters"
                errorText="Type DELETE in capital letters" />
              @if (error(); as message) { <p role="alert" class="error-text">{{ message }}</p> }
              <ion-button type="submit" expand="block" color="danger" [disabled]="busy() || form.controls.confirm.value !== 'DELETE'">
                @if (busy()) { <ion-spinner name="crescent" aria-label="Deleting" /> } @else { <app-icon slot="start" name="trash" />Delete my account }
              </ion-button>
            </form>
          } @else {
            <section class="card">
              <h2><span class="head-icon"><app-icon name="sign-in" weight="duotone" /></span>How to delete it</h2>
              <ol>
                <li>Sign in to Small Mart (in the app or on this website).</li>
                <li>Open <strong>Account</strong>, then <strong>Delete account</strong>.</li>
                <li>Confirm with your password and the word DELETE.</li>
              </ol>
              <ion-button expand="block" routerLink="/login" [queryParams]="{ returnUrl: '/delete-account' }"><app-icon slot="start" name="sign-in" />Sign in to delete my account</ion-button>
              @if (supportEmail) {
                <p class="muted">Can't sign in? Email <a [href]="'mailto:' + supportEmail + '?subject=Delete%20my%20Small%20Mart%20account'">{{ supportEmail }}</a> from the address you signed up with and we will delete it within 7 days.</p>
              }
            </section>
          }
          <p class="legal-foot"><a routerLink="/privacy">Read the privacy policy</a></p>
        }
      </main>
    </ion-content>
  `,
})
export class DeleteAccountPage {
  protected readonly auth = inject(AuthService);
  protected readonly supportEmail = environment.supportEmail;
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly done = signal(false);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    password: [''],
    confirm: ['', [Validators.required, Validators.pattern(/^DELETE$/)]],
  });

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const { password, confirm } = this.form.getRawValue();
      await this.auth.deleteAccount(password, confirm);
      this.done.set(true);
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
