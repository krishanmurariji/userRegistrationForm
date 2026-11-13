import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonInput, IonSpinner, IonText, IonTextarea, IonTitle, IonToolbar } from '@ionic/angular';
import { toApiError } from '../core/api-error';
import { ShopService, fileUrl } from '../core/shop.service';

/** Creates a shop (/shops/new) or edits one (/shops/:shopId/edit). */
@Component({
  selector: 'app-shop-form',
  imports: [ReactiveFormsModule, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonInput, IonTextarea, IonButton, IonSpinner, IonText],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button [defaultHref]="shopId ? '/shops/' + shopId : '/'" /></ion-buttons>
        <ion-title>{{ shopId ? 'Shop details' : 'Open a shop' }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <main class="page-column">
        @if (loading()) {
          <div class="centered"><ion-spinner name="crescent" aria-label="Loading" /></div>
        } @else {
          <form [formGroup]="form" (ngSubmit)="save()" novalidate class="stack">
            @if (shopId) {
              <div class="photo-row">
                <div class="photo">
                  @if (logoUrl(); as src) { <img [src]="src" alt="Shop logo" /> } @else { <span>No logo</span> }
                </div>
                <ion-button fill="outline" [disabled]="busy()" (click)="picker.click()">
                  {{ logoUrl() ? 'Change logo' : 'Add logo' }}
                </ion-button>
                <input #picker type="file" accept="image/jpeg,image/png,image/webp" hidden (change)="uploadLogo($event)" />
              </div>
            }

            <ion-input formControlName="name" label="Shop name" labelPlacement="stacked" fill="outline"
              autocomplete="organization" errorText="Enter the shop name" />
            <ion-textarea formControlName="description" label="About the shop (optional)" labelPlacement="stacked"
              fill="outline" [autoGrow]="true" [counter]="true" [maxlength]="1000" />
            <ion-input formControlName="phone" type="tel" inputmode="tel" label="Phone" labelPlacement="stacked"
              fill="outline" autocomplete="tel" errorText="Enter a valid phone number" />
            <ion-input formControlName="addressLine" label="Address" labelPlacement="stacked" fill="outline"
              autocomplete="street-address" errorText="Enter the shop address" />
            <div class="two-columns">
              <ion-input formControlName="city" label="City" labelPlacement="stacked" fill="outline"
                autocomplete="address-level2" errorText="Enter the city" />
              <ion-input formControlName="pincode" inputmode="numeric" maxlength="6" label="Pincode"
                labelPlacement="stacked" fill="outline" autocomplete="postal-code" errorText="Enter a 6-digit pincode" />
            </div>
            <ion-input formControlName="upiId" label="UPI ID (optional)" labelPlacement="stacked" fill="outline"
              autocapitalize="off" helperText="Customers pay to this, for example name@bank"
              errorText="Enter a valid UPI ID, for example name@bank" />
            <div class="two-columns">
              <ion-input formControlName="deliveryFee" type="number" inputmode="decimal" min="0"
                label="Delivery fee (₹)" labelPlacement="stacked" fill="outline" errorText="Enter 0 or more" />
              <ion-input formControlName="minimumOrder" type="number" inputmode="decimal" min="0"
                label="Minimum order (₹)" labelPlacement="stacked" fill="outline" errorText="Enter 0 or more" />
            </div>

            @if (error(); as message) {
              <ion-text color="danger" role="alert"><p class="message">{{ message }}</p></ion-text>
            }

            <ion-button type="submit" expand="block" [disabled]="busy()">
              @if (busy()) { <ion-spinner name="crescent" aria-label="Saving" /> }
              @else { {{ shopId ? 'Save changes' : 'Open shop' }} }
            </ion-button>
          </form>
        }
      </main>
    </ion-content>
  `,
})
export class ShopFormPage implements OnInit {
  private readonly shops = inject(ShopService);
  private readonly router = inject(Router);

  protected readonly shopId = inject(ActivatedRoute).snapshot.paramMap.get('shopId');
  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(120)]],
    description: ['', Validators.maxLength(1000)],
    phone: ['', [Validators.required, Validators.pattern(/^\+?[0-9][0-9 \-]{6,18}$/)]],
    addressLine: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(300)]],
    city: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(100)]],
    pincode: ['', [Validators.required, Validators.pattern(/^[1-9][0-9]{5}$/)]],
    upiId: ['', Validators.pattern(/^[A-Za-z0-9._\-]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}$/)],
    deliveryFee: [0, [Validators.required, Validators.min(0), Validators.max(10000)]],
    minimumOrder: [0, [Validators.required, Validators.min(0), Validators.max(100000)]],
  });
  protected readonly loading = signal(this.shopId !== null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly logoUrl = signal<string | null>(null);
  private isOpen = true;

  async ngOnInit(): Promise<void> {
    if (!this.shopId) return;
    try {
      const shop = await this.shops.shop(this.shopId);
      this.form.patchValue({ ...shop, description: shop.description ?? '', upiId: shop.upiId ?? '' });
      if (!shop.isActive) this.error.set('This shop has been deactivated by the platform admin and cannot be changed.');
      this.isOpen = shop.isOpen;
      this.logoUrl.set(fileUrl(shop.logoUrl));
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;

    this.busy.set(true);
    this.error.set('');
    try {
      const value = this.form.getRawValue();
      const input = {
        ...value,
        description: value.description.trim() || null,
        upiId: value.upiId.trim() || null,
        deliveryFee: Number(value.deliveryFee),
        minimumOrder: Number(value.minimumOrder),
        isOpen: this.isOpen,
      };
      const shop = this.shopId ? await this.shops.updateShop(this.shopId, input) : await this.shops.createShop(input);
      await this.router.navigate(['/shops', shop.id], { replaceUrl: true });
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async uploadLogo(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.shopId) return;

    this.busy.set(true);
    this.error.set('');
    try {
      const shop = await this.shops.uploadLogo(this.shopId, file);
      this.logoUrl.set(fileUrl(shop.logoUrl));
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
