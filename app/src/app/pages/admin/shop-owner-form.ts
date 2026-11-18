import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonInput, IonInputPasswordToggle, IonSpinner, IonTitle, IonToolbar, NavController } from '@ionic/angular';
import { AppIcon } from '../../core/icon';
import { AdminService } from '../../core/admin.service';
import { toApiError } from '../../core/api-error';
import { PASSWORD_HINT, PASSWORD_PATTERN } from '../register';

/** The only way a shop owner account comes into existence. */
@Component({
  selector: 'app-shop-owner-form',
  imports: [ReactiveFormsModule, AppIcon, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonInput, IonInputPasswordToggle, IonButton, IonSpinner],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/admin" text="" /></ion-buttons>
        <ion-title>Add shop owner</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="shop-bg">
      <main class="shop-column narrow admin">
        @if (created(); as email) {
          <section class="card ok-card admin-done" role="status">
            <span class="empty-art"><app-icon name="seal-check" weight="duotone" /></span>
            <h1>Shop owner added</h1>
            <p>
              @if (invited()) {
                We emailed <strong>{{ email }}</strong> a link to choose a password. The link works for 24 hours.
              } @else {
                <strong>{{ email }}</strong> can now sign in with the password you set. Ask them to change it after signing in.
              }
            </p>
            <ion-button expand="block" (click)="back()">Back to users</ion-button>
            <ion-button expand="block" fill="outline" (click)="another()"><app-icon slot="start" name="user-plus" />Add another</ion-button>
          </section>
        } @else {
          <section class="scan-hero admin-form-hero">
            <span class="ai-icon big"><app-icon name="user-plus" weight="duotone" /></span>
            <span><strong>Invite a shop owner</strong><small>Owners can open shops, list items and take orders. Leave the password empty and we email them a link to set one.</small></span>
          </section>
          <form [formGroup]="form" (ngSubmit)="save()" novalidate class="card stack">
            <h2><span class="head-icon"><app-icon name="identification-card" weight="duotone" /></span>Owner details</h2>
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
              <p role="alert" class="error-text">{{ message }}</p>
            }

            <ion-button type="submit" expand="block" [disabled]="busy()">
              @if (busy()) { <ion-spinner name="crescent" aria-label="Saving" /> } @else { <app-icon slot="start" name="user-plus" />Add shop owner }
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
