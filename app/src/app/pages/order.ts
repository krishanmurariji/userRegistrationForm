import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonInput, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular';
import { toApiError } from '../core/api-error';
import { CartActions } from '../core/cart-actions';
import { OrderTracker } from '../core/order-tracker';
import { Order, paymentColor, paymentLabel } from '../core/store.models';
import { StoreService } from '../core/store.service';

/** A customer's view of one order: where it is, how to pay by UPI, and what was ordered. */
@Component({
  selector: 'app-order',
  imports: [CurrencyPipe, ReactiveFormsModule, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonInput, IonButton, IonSpinner, OrderTracker],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/orders" /></ion-buttons>
        <ion-title>{{ order()?.number ?? 'Order' }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="shop-bg">
      <main class="shop-column narrow">
        @if (error(); as message) {
          <div class="card"><p role="alert" class="error-text">{{ message }}</p></div>
        }
        @if (order(); as o) {
          <section class="card">
            <header class="card-head">
              <h1>{{ o.shopName }}</h1>
              <span class="status" [attr.data-color]="paymentColor(o)">{{ paymentLabel(o) }}</span>
            </header>
            <app-order-tracker [order]="o" />
          </section>

          @if (o.paymentMethod === 'Upi' && o.status !== 'Cancelled') {
            <section class="card pay-card">
              @switch (o.paymentStatus) {
                @case ('Paid') {
                  <h2>Payment confirmed</h2>
                  <p>The shop received {{ o.total | currency: 'INR' : 'symbol' : '1.0-2' }} by UPI (transaction ID {{ o.upiReference }}).</p>
                }
                @case ('AwaitingVerification') {
                  <h2>The shop is checking your payment</h2>
                  <p>You sent transaction ID {{ o.upiReference }}. You will see the result here once the shop has checked.</p>
                }
                @default {
                  @if (o.paymentStatus === 'Rejected') {
                    <div class="closed-note" role="alert">
                      <strong>The shop could not find your payment.</strong> {{ o.paymentRejectReason }}
                      Check the transaction ID and send it again, or call the shop on {{ o.shopPhone }}.
                    </div>
                  }
                  @if (o.upi; as upi) {
                    <h2><span class="step">1</span>Pay {{ upi.amount | currency: 'INR' : 'symbol' : '1.0-2' }} by UPI</h2>
                    <p>Pay to <strong class="selectable">{{ upi.upiId }}</strong> ({{ upi.payeeName }}).</p>
                    <div class="upi-pay">
                      @if (qr(); as src) { <img [src]="src" width="180" height="180" alt="UPI QR code for this payment" /> }
                      <div>
                        <ion-button [href]="upi.payUri">Open UPI app</ion-button>
                        <p class="hint">On a computer, scan the QR code with your phone's UPI app. The amount is filled in for you.</p>
                      </div>
                    </div>
                    <h2><span class="step">2</span>Tell the shop you paid</h2>
                    <form [formGroup]="proof" (ngSubmit)="submitProof()" novalidate class="stack">
                      <ion-input formControlName="reference" label="UPI transaction ID (UTR)" labelPlacement="stacked" fill="outline"
                        autocapitalize="characters" helperText="Shown in your UPI app after paying, usually 12 digits"
                        errorText="Enter the transaction ID from your UPI app" />
                      <div class="attach">
                        <ion-button fill="outline" [disabled]="busy()" (click)="picker.click()">
                          {{ screenshot() ? 'Change screenshot' : 'Attach payment screenshot' }}
                        </ion-button>
                        <span class="hint">{{ screenshot()?.name ?? 'No screenshot attached' }}</span>
                        <input #picker type="file" accept="image/jpeg,image/png,image/webp" hidden (change)="pick($event)" />
                      </div>
                      @if (proofError(); as message) { <p role="alert" class="error-text">{{ message }}</p> }
                      <ion-button type="submit" expand="block" [disabled]="busy()">
                        @if (busy()) { <ion-spinner name="crescent" aria-label="Sending" /> } @else { I have paid }
                      </ion-button>
                    </form>
                  } @else {
                    <p>This shop no longer accepts UPI. Please call the shop on {{ o.shopPhone }}.</p>
                  }
                }
              }
            </section>
          }

          <section class="card">
            <h2>{{ o.items.length }} {{ o.items.length === 1 ? 'item' : 'items' }}</h2>
            <ul class="order-lines">
              @for (line of o.items; track $index) {
                <li>
                  <span class="count">{{ line.quantity }} ×</span>
                  <span class="what"><strong>{{ line.name }}</strong><small>{{ line.unit }} · {{ line.unitPrice | currency: 'INR' : 'symbol' : '1.0-2' }} each</small></span>
                  <strong>{{ line.lineTotal | currency: 'INR' : 'symbol' : '1.0-2' }}</strong>
                </li>
              }
            </ul>
          </section>

          <section class="card bill">
            <h2>Bill details</h2>
            <dl>
              <dt>Items total</dt><dd>{{ o.subtotal | currency: 'INR' : 'symbol' : '1.0-2' }}</dd>
              <dt>Delivery fee</dt><dd>{{ o.deliveryFee ? (o.deliveryFee | currency: 'INR' : 'symbol' : '1.0-2') : 'Free' }}</dd>
              <dt class="grand">{{ o.paymentStatus === 'Paid' ? 'Paid' : 'To pay' }}</dt><dd class="grand">{{ o.total | currency: 'INR' : 'symbol' : '1.0-2' }}</dd>
            </dl>
          </section>

          <section class="card">
            <h2>Delivering to</h2>
            <p class="address"><strong>{{ o.customerName }}</strong><br />{{ o.addressLine }}, {{ o.city }} {{ o.pincode }}<br />{{ o.phone }}</p>
            @if (o.note) { <p class="hint">Note: {{ o.note }}</p> }
          </section>

          <section class="card">
            <h2>Need help?</h2>
            <p>Call {{ o.shopName }} on <a [href]="'tel:' + o.shopPhone">{{ o.shopPhone }}</a>.</p>
            @if (notice(); as message) { <p role="status" class="hint">{{ message }}</p> }
            <div class="actions">
              @if (o.status === 'Delivered' || o.status === 'Cancelled') {
                <ion-button fill="outline" [disabled]="busy()" (click)="again()">Order again</ion-button>
              }
              @if (o.status === 'Placed') {
                <ion-button fill="outline" color="danger" [disabled]="busy()" (click)="cancel()">Cancel order</ion-button>
              }
            </div>
          </section>
        } @else if (!error()) {
          <div class="centered"><ion-spinner name="crescent" aria-label="Loading order" /></div>
        }
      </main>
    </ion-content>
  `,
})
export class OrderPage {
  private readonly store = inject(StoreService);
  private readonly alerts = inject(AlertController);
  private readonly cartActions = inject(CartActions);
  private readonly orderId = inject(ActivatedRoute).snapshot.paramMap.get('orderId')!;

  protected readonly order = signal<Order | null>(null);
  protected readonly qr = signal<string | null>(null);
  protected readonly screenshot = signal<File | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly proofError = signal('');
  protected readonly notice = signal('');
  protected readonly proof = inject(FormBuilder).nonNullable.group({
    reference: ['', [Validators.required, Validators.pattern(/^\s*[A-Za-z0-9]{8,35}\s*$/)]],
  });
  protected readonly paymentLabel = paymentLabel;
  protected readonly paymentColor = paymentColor;
  private timer: ReturnType<typeof setInterval> | null = null;

  ionViewWillEnter(): void {
    void this.load();
    // The shop changes the order from its side, so look again every 20 seconds while this page is open.
    this.timer = setInterval(() => void this.load(true), 20_000);
  }

  ionViewWillLeave(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async load(quiet = false): Promise<void> {
    if (quiet && (this.busy() || document.hidden)) return;
    try {
      await this.show(await this.store.order(this.orderId));
      if (!quiet) this.error.set('');
    } catch (e) {
      if (!quiet) this.error.set(toApiError(e).message);
    }
  }

  private async show(order: Order): Promise<void> {
    const previousUri = this.order()?.upi?.payUri;
    this.order.set(order);
    if (order.upi && order.upi.payUri !== previousUri) {
      const { toDataURL } = await import('qrcode');
      this.qr.set(await toDataURL(order.upi.payUri, { width: 360, margin: 1 }));
    }
  }

  protected pick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this.proofError.set('The screenshot is larger than 5 MB. Please choose a smaller one.');
      return;
    }
    this.proofError.set('');
    this.screenshot.set(file);
  }

  protected async submitProof(): Promise<void> {
    this.proof.markAllAsTouched();
    if (this.proof.invalid || this.busy()) return;
    const file = this.screenshot();
    if (!file) {
      this.proofError.set('Attach a screenshot of the payment from your UPI app.');
      return;
    }

    this.busy.set(true);
    this.proofError.set('');
    try {
      await this.show(await this.store.submitUpiProof(this.orderId, this.proof.getRawValue().reference.trim(), file));
      this.screenshot.set(null);
      this.proof.reset();
    } catch (e) {
      this.proofError.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  /** Puts the same items in the cart again, at today's prices. */
  protected async again(): Promise<void> {
    const order = this.order();
    if (!order) return;
    this.busy.set(true);
    this.error.set('');
    try {
      this.notice.set(await this.cartActions.orderAgain(order));
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async cancel(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Cancel this order?',
      message: 'The shop will be told not to prepare it.',
      buttons: [{ text: 'Keep order', role: 'cancel' }, { text: 'Cancel order', role: 'destructive' }],
    });
    await alert.present();
    if ((await alert.onDidDismiss()).role !== 'destructive') return;

    this.busy.set(true);
    this.error.set('');
    try {
      await this.show(await this.store.cancelOrder(this.orderId));
    } catch (e) {
      this.error.set(toApiError(e).message);
      await this.load(true);
    } finally {
      this.busy.set(false);
    }
  }
}
