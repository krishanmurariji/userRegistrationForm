import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonInput, IonSpinner, IonTextarea, IonTitle, IonToolbar } from '@ionic/angular';
import { AppIcon } from '../core/icon';
import { SkeletonList } from '../core/skeletons';
import { toApiError } from '../core/api-error';
import { Shop } from '../core/shop.models';
import { ShopService, fileUrl } from '../core/shop.service';

/** Creates a shop (/shops/new) or edits one (/shops/:shopId/edit). */
@Component({
  selector: 'app-shop-form',
  imports: [ReactiveFormsModule, AppIcon, SkeletonList, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonFooter, IonInput, IonTextarea, IonButton, IonSpinner],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button [defaultHref]="shopId ? '/shops/' + shopId : '/my-shops'" text="" /></ion-buttons>
        <ion-title>{{ shopId ? 'Shop details' : 'Open a shop' }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="shop-bg">
      <main class="shop-column narrow owner-form">
        @if (loading()) {
          <app-skeleton-list [count]="3" />
        } @else {
          <form [formGroup]="form" (ngSubmit)="save()" novalidate>
            @if (shopId) {
              <section class="brand-editor" [class.has-cover]="!!coverUrl()">
                @if (coverUrl(); as src) { <img class="cover" [src]="src" alt="Shop cover picture" /> }
                <button type="button" class="cover-btn" [disabled]="busy()" (click)="coverPicker.click()">
                  <app-icon name="image" />{{ coverUrl() ? 'Change cover' : 'Add a cover picture' }}
                </button>
                <button type="button" class="logo-btn" [disabled]="busy()" (click)="picker.click()" [attr.aria-label]="logoUrl() ? 'Change logo' : 'Add logo'">
                  @if (logoUrl(); as src) { <img [src]="src" alt="Shop logo" /> } @else { <app-icon name="storefront" weight="duotone" /> }
                  <span class="edit"><app-icon name="pen" /></span>
                </button>
                <input #picker type="file" accept="image/jpeg,image/png,image/webp" hidden (change)="uploadLogo($event)" />
                <input #coverPicker type="file" accept="image/jpeg,image/png,image/webp" hidden (change)="uploadCover($event)" />
              </section>
              <p class="hint center">The cover is a wide photo of your shop front or shelves. Customers see both at the top of your shop.</p>
            } @else {
              <div class="ai-banner static">
                <span class="ai-icon"><app-icon name="storefront" weight="duotone" /></span>
                <span class="what"><strong>Let's set up your shop</strong><small>You can add a logo and a cover picture right after this.</small></span>
              </div>
            }

            <section class="card stack">
              <h2><span class="head-icon"><app-icon name="storefront" weight="duotone" /></span>About the shop</h2>
              <ion-input formControlName="name" label="Shop name" labelPlacement="stacked" fill="outline"
                autocomplete="organization" errorText="Enter the shop name" />
              <ion-textarea formControlName="description" label="About the shop (optional)" labelPlacement="stacked"
                fill="outline" [autoGrow]="true" [counter]="true" [maxlength]="1000" />
              <ion-input formControlName="phone" type="tel" inputmode="tel" label="Phone" labelPlacement="stacked"
                fill="outline" autocomplete="tel" errorText="Enter a valid phone number" />
            </section>

            <section class="card stack">
              <h2><span class="head-icon"><app-icon name="map-pin" weight="duotone" /></span>Address</h2>
              <ion-input formControlName="addressLine" label="Address" labelPlacement="stacked" fill="outline"
                autocomplete="street-address" errorText="Enter the shop address" />
              <div class="two-columns">
                <ion-input formControlName="city" label="City" labelPlacement="stacked" fill="outline"
                  autocomplete="address-level2" errorText="Enter the city" />
                <ion-input formControlName="pincode" inputmode="numeric" maxlength="6" label="Pincode"
                  labelPlacement="stacked" fill="outline" autocomplete="postal-code" errorText="Enter a 6-digit pincode" />
              </div>
            </section>

            <section class="card stack">
              <h2><span class="head-icon"><app-icon name="moped" weight="duotone" /></span>Delivery and payment</h2>
              <div class="two-columns">
                <ion-input formControlName="deliveryFee" type="number" inputmode="decimal" min="0"
                  label="Delivery fee (₹)" labelPlacement="stacked" fill="outline" errorText="Enter 0 or more" />
                <ion-input formControlName="minimumOrder" type="number" inputmode="decimal" min="0"
                  label="Minimum order (₹)" labelPlacement="stacked" fill="outline" errorText="Enter 0 or more" />
              </div>
              <ion-input formControlName="upiId" label="UPI ID (optional)" labelPlacement="stacked" fill="outline"
                autocapitalize="off" helperText="Customers pay to this, for example name@bank. Leave empty for cash on delivery only."
                errorText="Enter a valid UPI ID, for example name@bank" />
            </section>

            @if (error(); as message) {
              <div class="card"><p role="alert" class="error-text">{{ message }}</p></div>
            }
            <button type="submit" hidden aria-hidden="true" tabindex="-1"></button>
          </form>
        }
      </main>
    </ion-content>
    @if (!loading()) {
      <ion-footer class="shop-footer">
        <div class="pay-bar">
          <span><small>{{ shopId ? 'Shop details' : 'New shop' }}</small><strong>{{ form.controls.name.value || 'Your shop' }}</strong></span>
          <ion-button [disabled]="busy()" (click)="save()">
            @if (busy()) { <ion-spinner name="crescent" aria-label="Saving" /> }
            @else { {{ shopId ? 'Save changes' : 'Open shop' }}<app-icon slot="end" name="check" /> }
          </ion-button>
        </div>
      </ion-footer>
    }
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
  protected readonly coverUrl = signal<string | null>(null);
  private isOpen = true;

  async ngOnInit(): Promise<void> {
    if (!this.shopId) return;
    try {
      const shop = await this.shops.shop(this.shopId);
      this.form.patchValue({ ...shop, description: shop.description ?? '', upiId: shop.upiId ?? '' });
      if (!shop.isActive) this.error.set('This shop has been deactivated by the platform admin and cannot be changed.');
      this.isOpen = shop.isOpen;
      this.logoUrl.set(fileUrl(shop.logoUrl));
      this.coverUrl.set(fileUrl(shop.coverUrl));
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

  protected uploadLogo(event: Event): Promise<void> {
    return this.upload(event, (id, file) => this.shops.uploadLogo(id, file));
  }

  protected uploadCover(event: Event): Promise<void> {
    return this.upload(event, (id, file) => this.shops.uploadCover(id, file));
  }

  private async upload(event: Event, send: (shopId: string, file: File) => Promise<Shop>): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.shopId) return;

    this.busy.set(true);
    this.error.set('');
    try {
      const shop = await send(this.shopId, file);
      this.logoUrl.set(fileUrl(shop.logoUrl));
      this.coverUrl.set(fileUrl(shop.coverUrl));
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
