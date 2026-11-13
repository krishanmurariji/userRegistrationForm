import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonInput, IonRadio, IonRadioGroup, IonSpinner, IonTextarea, IonTitle, IonToolbar } from '@ionic/angular';
import { toApiError } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { CartService } from '../core/cart.service';
import { PaymentMethod } from '../core/store.models';
import { StoreService } from '../core/store.service';

@Component({
  selector: 'app-checkout',
  imports: [CurrencyPipe, ReactiveFormsModule, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonFooter, IonInput, IonTextarea, IonRadioGroup, IonRadio, IonButton, IonSpinner],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/cart" /></ion-buttons>
        <ion-title>Checkout</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="shop-bg">
      <main class="shop-column narrow">
        @if (cart.cart(); as c) {
          <form id="checkout-form" [formGroup]="form" (ngSubmit)="place()" novalidate>
            <section class="card">
              <h2><span class="step">1</span>Delivery details</h2>
              <div class="stack">
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
              </div>
            </section>

            <section class="card">
              <h2><span class="step">2</span>Payment</h2>
              <ion-radio-group formControlName="paymentMethod" class="pay-options">
                <label class="pay-option" [class.on]="form.controls.paymentMethod.value === 'CashOnDelivery'">
                  <ion-radio value="CashOnDelivery" labelPlacement="end" justify="start">
                    <span class="pay-text"><strong>Cash on delivery</strong><small>Pay when your order arrives</small></span>
                  </ion-radio>
                </label>
                @if (c.shop.acceptsUpi) {
                  <label class="pay-option" [class.on]="form.controls.paymentMethod.value === 'Upi'">
                    <ion-radio value="Upi" labelPlacement="end" justify="start">
                      <span class="pay-text"><strong>UPI</strong><small>Pay now with any UPI app; the shop confirms it</small></span>
                    </ion-radio>
                  </label>
                }
              </ion-radio-group>
              @if (!c.shop.acceptsUpi) { <p class="hint">This shop accepts cash on delivery only.</p> }
            </section>

            <section class="card bill">
              <h2><span class="step">3</span>Order summary</h2>
              <p class="hint">{{ cart.count() }} {{ cart.count() === 1 ? 'item' : 'items' }} from {{ c.shop.name }}</p>
              <dl>
                <dt>Items total</dt><dd>{{ cart.subtotal() | currency: 'INR' : 'symbol' : '1.0-2' }}</dd>
                <dt>Delivery fee</dt><dd>{{ c.shop.deliveryFee ? (c.shop.deliveryFee | currency: 'INR' : 'symbol' : '1.0-2') : 'Free' }}</dd>
                <dt class="grand">To pay</dt><dd class="grand">{{ cart.total() | currency: 'INR' : 'symbol' : '1.0-2' }}</dd>
              </dl>
            </section>

            @if (error(); as message) {
              <div class="card"><p role="alert" class="error-text">{{ message }}</p></div>
            }
          </form>
        } @else if (!busy()) {
          <div class="card empty-card tall">
            <p><strong>Your cart is empty.</strong></p>
            <ion-button (click)="router.navigateByUrl('/')">Browse shops</ion-button>
          </div>
        }
      </main>
    </ion-content>

    @if (cart.cart(); as c) {
      <ion-footer class="shop-footer">
        <div class="pay-bar">
          <span><small>To pay</small><strong>{{ cart.total() | currency: 'INR' : 'symbol' : '1.0-2' }}</strong></span>
          <ion-button [disabled]="busy() || !c.shop.isOpen || cart.belowMinimum()" (click)="place()">
            @if (busy()) { <ion-spinner name="crescent" aria-label="Placing order" /> } @else { Place order }
          </ion-button>
        </div>
      </ion-footer>
    }
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
      if (['cart_changed', 'items_unavailable', 'insufficient_stock', 'below_minimum', 'shop_closed', 'upi_unavailable', 'shop_unavailable'].includes(code)) {
        await this.cart.refresh().catch(() => undefined);
      }
    } finally {
      this.busy.set(false);
    }
  }
}
