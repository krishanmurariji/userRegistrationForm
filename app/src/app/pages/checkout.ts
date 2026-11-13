import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonInput, IonItem, IonRadio, IonRadioGroup, IonSpinner, IonText, IonTextarea, IonTitle, IonToolbar } from '@ionic/angular';
import { toApiError } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { CartService } from '../core/cart.service';
import { PaymentMethod } from '../core/store.models';
import { StoreService } from '../core/store.service';

@Component({
  selector: 'app-checkout',
  imports: [CurrencyPipe, ReactiveFormsModule, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonInput, IonTextarea, IonRadioGroup, IonRadio, IonItem, IonButton, IonSpinner, IonText],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/cart" /></ion-buttons>
        <ion-title>Checkout</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <main class="page-column">
        @if (cart.cart(); as c) {
          <form [formGroup]="form" (ngSubmit)="place()" novalidate class="stack">
            <h2 class="section-title">Delivery details</h2>
            <ion-input formControlName="customerName" label="Name" labelPlacement="stacked" fill="outline"
              autocomplete="name" errorText="Enter the name for delivery" />
            <ion-input formControlName="phone" type="tel" inputmode="tel" label="Phone" labelPlacement="stacked"
              fill="outline" autocomplete="tel" errorText="Enter a valid phone number" />
            <ion-input formControlName="addressLine" label="Address" labelPlacement="stacked" fill="outline"
              autocomplete="street-address" helperText="House or flat number, street, landmark" errorText="Enter the delivery address" />
            <div class="two-columns">
              <ion-input formControlName="city" label="City" labelPlacement="stacked" fill="outline"
                autocomplete="address-level2" errorText="Enter the city" />
              <ion-input formControlName="pincode" inputmode="numeric" maxlength="6" label="Pincode"
                labelPlacement="stacked" fill="outline" autocomplete="postal-code" errorText="Enter a 6-digit pincode" />
            </div>
            <ion-textarea formControlName="note" label="Note for the shop (optional)" labelPlacement="stacked"
              fill="outline" [autoGrow]="true" [maxlength]="500" />

            <h2 class="section-title">Payment</h2>
            <ion-radio-group formControlName="paymentMethod">
              <ion-item lines="none" class="plain-item">
                <ion-radio value="CashOnDelivery" labelPlacement="end" justify="start">Cash on delivery</ion-radio>
              </ion-item>
              @if (c.shop.acceptsUpi) {
                <ion-item lines="none" class="plain-item">
                  <ion-radio value="Upi" labelPlacement="end" justify="start">UPI (pay now, the shop confirms it)</ion-radio>
                </ion-item>
              }
            </ion-radio-group>
            @if (!c.shop.acceptsUpi) { <p class="meta">This shop accepts cash on delivery only.</p> }

            <table class="lines totals">
              <tfoot>
                <tr><td>{{ cart.count() }} {{ cart.count() === 1 ? 'item' : 'items' }} from {{ c.shop.name }}</td><td class="amount">{{ cart.subtotal() | currency: 'INR' : 'symbol' : '1.0-2' }}</td></tr>
                <tr><td>Delivery fee</td><td class="amount">{{ c.shop.deliveryFee | currency: 'INR' : 'symbol' : '1.0-2' }}</td></tr>
                <tr class="grand"><td>Total</td><td class="amount">{{ cart.total() | currency: 'INR' : 'symbol' : '1.0-2' }}</td></tr>
              </tfoot>
            </table>

            @if (error(); as message) {
              <ion-text color="danger" role="alert"><p class="message">{{ message }}</p></ion-text>
            }
            <ion-button type="submit" expand="block" [disabled]="busy() || !c.shop.isOpen || cart.belowMinimum()">
              @if (busy()) { <ion-spinner name="crescent" aria-label="Placing order" /> }
              @else { Place order · {{ cart.total() | currency: 'INR' : 'symbol' : '1.0-2' }} }
            </ion-button>
          </form>
        } @else if (!busy()) {
          <p class="muted">Your cart is empty.</p>
          <ion-button expand="block" (click)="router.navigateByUrl('/')">Browse shops</ion-button>
        }
      </main>
    </ion-content>
  `,
})
export class CheckoutPage {
  private readonly store = inject(StoreService);
  private readonly auth = inject(AuthService);
  protected readonly cart = inject(CartService);
  protected readonly router = inject(Router);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    customerName: [this.auth.user()?.fullName ?? '', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(200)]],
    phone: ['', [Validators.required, Validators.pattern(/^\+?[0-9][0-9 \-]{6,18}$/)]],
    addressLine: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(300)]],
    city: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(100)]],
    pincode: ['', [Validators.required, Validators.pattern(/^[1-9][0-9]{5}$/)]],
    note: ['', Validators.maxLength(500)],
    paymentMethod: ['CashOnDelivery' as PaymentMethod],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  private prefilled = false;

  async ionViewWillEnter(): Promise<void> {
    this.error.set('');
    try {
      const changed = await this.cart.refresh();
      if (changed) this.error.set(`Your cart was updated. ${changed} Please check the total before ordering.`);
      if (!this.prefilled) {
        this.prefilled = true;
        const address = await this.store.lastAddress();
        if (address && this.form.pristine) this.form.patchValue(address);
      }
    } catch (e) {
      this.error.set(toApiError(e).message);
    }
  }

  protected async place(): Promise<void> {
    this.form.markAllAsTouched();
    const cart = this.cart.cart();
    if (this.form.invalid || this.busy() || !cart) return;

    this.busy.set(true);
    this.error.set('');
    try {
      const value = this.form.getRawValue();
      const order = await this.store.placeOrder({
        shopId: cart.shop.id,
        items: cart.lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity })),
        paymentMethod: cart.shop.acceptsUpi ? value.paymentMethod : 'CashOnDelivery',
        customerName: value.customerName.trim(),
        phone: value.phone.trim(),
        addressLine: value.addressLine.trim(),
        city: value.city.trim(),
        pincode: value.pincode,
        note: value.note.trim() || null,
        expectedTotal: this.cart.total(),
      });
      await this.router.navigate(['/orders', order.id], { replaceUrl: true });
      this.cart.clear();
    } catch (e) {
      const { code, message } = toApiError(e);
      this.error.set(message);
      // The shop changed something since the cart was last checked: bring the cart up to date.
      if (['cart_changed', 'items_unavailable', 'below_minimum', 'shop_closed', 'upi_unavailable', 'shop_unavailable'].includes(code)) {
        await this.cart.refresh().catch(() => undefined);
      }
    } finally {
      this.busy.set(false);
    }
  }
}
