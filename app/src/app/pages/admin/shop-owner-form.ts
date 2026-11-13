import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonInput, IonInputPasswordToggle, IonSpinner, IonText, IonTitle, IonToolbar, NavController } from '@ionic/angular';
import { AdminService } from '../../core/admin.service';
import { toApiError } from '../../core/api-error';
import { PASSWORD_HINT, PASSWORD_PATTERN } from '../register';

/** The only way a shop owner account comes into existence. */
@Component({
  selector: 'app-shop-owner-form',
  imports: [ReactiveFormsModule, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonInput, IonInputPasswordToggle, IonButton, IonSpinner, IonText],
  template: `
    <ion-header>
      <ion-toolbar color="dark">
        <ion-buttons slot="start"><ion-back-button defaultHref="/admin" /></ion-buttons>
        <ion-title>Add shop owner</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <main class="page-column">
        @if (created(); as email) {
          <h1>Shop owner added</h1>
          <p role="status">
            @if (invited()) {
              We emailed <strong>{{ email }}</strong> a link to choose a password. The link works for 24 hours.
            } @else {
              <strong>{{ email }}</strong> can now sign in with the password you set. Ask them to change it after signing in.
            }
          </p>
          <ion-button expand="block" (click)="back()">Back to users</ion-button>
          <ion-button expand="block" fill="outline" (click)="another()">Add another</ion-button>
        } @else {
          <form [formGroup]="form" (ngSubmit)="save()" novalidate class="stack">
            <ion-input formControlName="fullName" label="Full name" labelPlacement="stacked" fill="outline"
              errorText="Enter the owner's name" />
            <ion-input formControlName="email" type="email" inputmode="email" label="Email" labelPlacement="stacked"
              fill="outline" errorText="Enter a valid email address" />
            <ion-input formControlName="password" type="password" autocomplete="new-password"
              label="Starting password (optional)" labelPlacement="stacked" fill="outline"
              helperText="Leave empty to email the owner a link to choose their own password"
              [errorText]="hint">
              <ion-input-password-toggle slot="end" />
            </ion-input>

            @if (error(); as message) {
              <ion-text color="danger" role="alert"><p class="message">{{ message }}</p></ion-text>
            }

            <ion-button type="submit" expand="block" [disabled]="busy()">
              @if (busy()) { <ion-spinner name="crescent" aria-label="Saving" /> } @else { Add shop owner }
            </ion-button>
          </form>
        }
      </main>
    </ion-content>
  `,
})
export class ShopOwnerFormPage {
  private readonly admin = inject(AdminService);
  private readonly nav = inject(NavController);

  protected readonly hint = PASSWORD_HINT;
  protected readonly form = inject(FormBuilder).nonNullable.group({
    fullName: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(200)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.pattern(PASSWORD_PATTERN), Validators.maxLength(128)]],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly created = signal('');
  protected readonly invited = signal(false);

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;

    this.busy.set(true);
    this.error.set('');
    try {
      const { fullName, email, password } = this.form.getRawValue();
      const user = await this.admin.createShopOwner(email.trim(), fullName.trim(), password || null);
      this.invited.set(!password);
      this.created.set(user.email);
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected back(): void {
    void this.nav.navigateBack('/admin');
  }

  protected another(): void {
    this.form.reset();
    this.created.set('');
  }
}
