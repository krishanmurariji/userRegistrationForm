import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnDestroy, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonBackButton, IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonSkeletonText, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular';
import { toApiError } from '../core/api-error';
import { AppIcon } from '../core/icon';
import { OrderHero } from '../core/order-hero';
import { OrderTracker } from '../core/order-tracker';
import { ShopService } from '../core/shop.service';
import { Order, OrderStatus, paymentColor, paymentLabel, statusColor, statusLabel } from '../core/store.models';

const NEXT: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  Placed: { status: 'Accepted', label: 'Accept order' },
  Accepted: { status: 'Packed', label: 'Mark as packed' },
  Packed: { status: 'OutForDelivery', label: 'Send out for delivery' },
  OutForDelivery: { status: 'Delivered', label: 'Mark as delivered' },
};

/** One order as the shop handles it: check the payment, move it along, or cancel it. */
@Component({
  selector: 'app-shop-order',
  imports: [CurrencyPipe, DatePipe, AppIcon, OrderHero, OrderTracker, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonFooter, IonButton, IonSpinner, IonSkeletonText],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button [defaultHref]="'/shops/' + shopId + '/orders'" text="" /></ion-buttons>
        <ion-title>{{ order()?.number ?? 'Order' }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="shop-bg">
      <main class="shop-column narrow owner-order-page">
        @if (error(); as message) {
          <div class="card"><p role="alert" class="error-text">{{ message }}</p></div>
        }
        @if (order(); as o) {
          <app-order-hero audience="shop" [status]="o.status" [number]="o.number" [shopName]="o.customerName" [reason]="o.cancelReason" />

          <section class="card owner-customer">
            <span class="avatar" aria-hidden="true">{{ initials(o.customerName) }}</span>
            <span class="who">
              <strong>{{ o.customerName }}</strong>
              <small>{{ o.addressLine }}, {{ o.city }} {{ o.pincode }}</small>
              <small>Ordered {{ o.createdAt | date: 'd MMM, h:mm a' }}</small>
            </span>
            <a class="call" [href]="'tel:' + o.phone" [attr.aria-label]="'Call ' + o.customerName"><app-icon name="phone-call" weight="duotone" /></a>
          </section>
          @if (o.note) {
            <div class="card owner-note"><app-icon name="note-pencil" weight="duotone" /><span><strong>Note from the customer</strong>{{ o.note }}</span></div>
          }

          @if (o.paymentMethod === 'Upi' && o.status !== 'Cancelled') {
            <section class="card pay-card owner-pay" [attr.data-state]="o.paymentStatus">
              @switch (o.paymentStatus) {
                @case ('AwaitingVerification') {
                  <h2><span class="head-icon warn"><app-icon name="qr-code" weight="duotone" /></span>Check this UPI payment</h2>
                  <p>
                    The customer says they paid <strong>{{ o.total | currency: 'INR' : 'symbol' : '1.0-2' }}</strong>
                    with transaction ID <strong class="selectable">{{ o.upiReference }}</strong>
                    @if (o.upiSubmittedAt) { on {{ o.upiSubmittedAt | date: 'd MMM, h:mm a' }} }.
                  </p>
                  <p class="warning-text">
                    Find this transaction ID and amount in your own bank or UPI app before confirming.
                    A screenshot can be faked, so never rely on it alone.
                  </p>
                  @if (proofUrl(); as src) {
                    <a [href]="src" target="_blank" rel="noopener"><img class="proof" [src]="src" alt="Payment screenshot sent by the customer" /></a>
                  } @else if (o.hasUpiProof) {
                    <ion-spinner name="crescent" aria-label="Loading screenshot" />
                  }
                  <div class="actions">
                    <ion-button color="success" [disabled]="busy()" (click)="verify()"><app-icon slot="start" name="check" />Payment received</ion-button>
                    <ion-button fill="outline" color="danger" [disabled]="busy()" (click)="reject()">Not received</ion-button>
                  </div>
                }
                @case ('Paid') {
                  <h2><span class="head-icon ok"><app-icon name="seal-check" weight="duotone" /></span>UPI payment confirmed</h2>
                  <p>Transaction ID {{ o.upiReference }}@if (o.paymentVerifiedAt) {, confirmed {{ o.paymentVerifiedAt | date: 'd MMM, h:mm a' }} }.</p>
                }
                @case ('Rejected') {
                  <h2><span class="head-icon bad"><app-icon name="x-circle" weight="duotone" /></span>Payment not found</h2>
                  <p>You told the customer: "{{ o.paymentRejectReason }}". They can send the details again.</p>
                }
                @default {
                  <h2><span class="head-icon"><app-icon name="clock" weight="duotone" /></span>Waiting for the UPI payment</h2>
                  <p>You can accept this order once the customer has paid and you have confirmed the payment.</p>
                }
              }
            </section>
          }

          <section class="card">
            <h2><span class="head-icon"><app-icon name="shopping-bag" weight="duotone" /></span>{{ o.items.length }} {{ o.items.length === 1 ? 'item' : 'items' }} to pack</h2>
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
            <h2><span class="head-icon"><app-icon name="receipt" weight="duotone" /></span>Bill</h2>
            <dl>
              <dt>Items total</dt><dd>{{ o.subtotal | currency: 'INR' : 'symbol' : '1.0-2' }}</dd>
              <dt>Delivery fee</dt><dd>{{ o.deliveryFee ? (o.deliveryFee | currency: 'INR' : 'symbol' : '1.0-2') : 'Free' }}</dd>
              <dt class="grand">{{ o.paymentStatus === 'Paid' ? 'Paid' : o.paymentMethod === 'CashOnDelivery' ? 'Collect in cash' : 'Total' }}</dt>
              <dd class="grand">{{ o.total | currency: 'INR' : 'symbol' : '1.0-2' }}</dd>
            </dl>
          </section>

          <section class="card">
            <header class="card-head">
              <h2><span class="head-icon"><app-icon name="clock" weight="duotone" /></span>Progress</h2>
              <span class="status" [attr.data-color]="paymentColor(o)">{{ paymentLabel(o) }}</span>
            </header>
            <app-order-tracker [order]="o" />
          </section>
        } @else if (!error()) {
          <div class="sk-order" aria-hidden="true">
            <ion-skeleton-text animated class="sk-hero" />
            <ion-skeleton-text animated class="sk-block" />
          </div>
        }
      </main>
    </ion-content>

    @if (order(); as o) {
      @if (next() || (o.status !== 'Delivered' && o.status !== 'Cancelled')) {
        <ion-footer class="shop-footer">
          <div class="pay-bar owner-bar">
            @if (o.status !== 'Delivered' && o.status !== 'Cancelled') {
              <button type="button" class="decline" [disabled]="busy()" (click)="cancel()">{{ o.status === 'Placed' ? 'Decline' : 'Cancel order' }}</button>
            }
            @if (next(); as step) {
              <ion-button [disabled]="busy() || blocked()" (click)="advance(step.status)">
                @if (busy()) { <ion-spinner name="crescent" aria-label="Saving" /> }
                @else { {{ step.status === 'Delivered' && o.paymentMethod === 'CashOnDelivery' ? 'Delivered, cash collected' : step.label }}<app-icon slot="end" name="arrow-right" /> }
              </ion-button>
            }
          </div>
          @if (blocked() && next()) { <p class="bar-hint">Confirm the UPI payment first.</p> }
        </ion-footer>
      }
    }
  `,
})
export class ShopOrderPage implements OnDestroy {
  private readonly shops = inject(ShopService);
  private readonly alerts = inject(AlertController);
  private readonly params = inject(ActivatedRoute).snapshot.paramMap;

  protected readonly shopId = this.params.get('shopId')!;
  private readonly orderId = this.params.get('orderId')!;
  protected readonly order = signal<Order | null>(null);
  protected readonly proofUrl = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly statusLabel = statusLabel;
  protected readonly statusColor = statusColor;
  protected readonly paymentLabel = paymentLabel;
  protected readonly paymentColor = paymentColor;
  private proofFor: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  protected initials(name: string): string {
    return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
  }

  protected next(): { status: OrderStatus; label: string } | undefined {
    const order = this.order();
    return order ? NEXT[order.status] : undefined;
  }

  /** A UPI order cannot move on until its payment is confirmed. */
  protected blocked(): boolean {
    const order = this.order();
    return !!order && order.paymentMethod === 'Upi' && order.paymentStatus !== 'Paid';
  }

  ionViewWillEnter(): void {
    void this.load();
    this.timer = setInterval(() => void this.load(true), 20_000);
  }

  ionViewWillLeave(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  ngOnDestroy(): void {
    this.releaseProof();
  }

  private async load(quiet = false): Promise<void> {
    if (quiet && (this.busy() || document.hidden)) return;
    try {
      this.show(await this.shops.order(this.shopId, this.orderId));
      if (!quiet) this.error.set('');
    } catch (e) {
      if (!quiet) this.error.set(toApiError(e).message);
    }
  }

  private show(order: Order): void {
    this.order.set(order);
    // Load the screenshot once per submission; a re-sent proof has a new submission time.
    const key = order.paymentStatus === 'AwaitingVerification' && order.hasUpiProof ? order.upiSubmittedAt : null;
    if (key === this.proofFor) return;
    this.proofFor = key;
    this.releaseProof();
    if (key) {
      void this.shops.upiProof(this.shopId, this.orderId)
        .then((blob) => this.proofFor === key && this.proofUrl.set(URL.createObjectURL(blob)))
        .catch(() => undefined);
    }
  }

  protected advance(status: OrderStatus): Promise<void> {
    return this.run(() => this.shops.advanceOrder(this.shopId, this.orderId, status));
  }

  protected async verify(): Promise<void> {
    const order = this.order()!;
    const alert = await this.alerts.create({
      header: 'Confirm payment received?',
      message: `Only confirm if ₹${order.total} with transaction ID ${order.upiReference} shows in your bank or UPI app.`,
      buttons: [{ text: 'Not yet', role: 'cancel' }, { text: 'Yes, received', role: 'confirm' }],
    });
    await alert.present();
    if ((await alert.onDidDismiss()).role === 'confirm') await this.run(() => this.shops.verifyPayment(this.shopId, this.orderId));
  }

  protected async reject(): Promise<void> {
    const reason = await this.askReason('Payment not received', 'Tell the customer what is wrong', 'No payment with this transaction ID was received');
    if (reason) await this.run(() => this.shops.rejectPayment(this.shopId, this.orderId, reason));
  }

  protected async cancel(): Promise<void> {
    const reason = await this.askReason('Cancel this order?', 'Reason shown to the customer', '');
    if (reason) await this.run(() => this.shops.cancelOrder(this.shopId, this.orderId, reason));
  }

  /** Asks for a reason. Returns null when the person backs out or leaves it empty. */
  private async askReason(header: string, placeholder: string, value: string): Promise<string | null> {
    const alert = await this.alerts.create({
      header,
      inputs: [{ name: 'reason', type: 'textarea', placeholder, value, attributes: { maxlength: 300 } }],
      buttons: [{ text: 'Back', role: 'cancel' }, { text: 'Confirm', role: 'confirm' }],
    });
    await alert.present();
    const { role, data } = await alert.onDidDismiss();
    const reason = (data?.values?.reason ?? '').trim();
    if (role !== 'confirm') return null;
    if (!reason) {
      this.error.set('Please give a reason so the customer knows what happened.');
      return null;
    }
    return reason;
  }

  private async run(change: () => Promise<Order>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      this.show(await change());
    } catch (e) {
      this.error.set(toApiError(e).message);
      await this.shops.order(this.shopId, this.orderId).then((o) => this.show(o)).catch(() => undefined);
    } finally {
      this.busy.set(false);
    }
  }

  private releaseProof(): void {
    const url = this.proofUrl();
    if (url) URL.revokeObjectURL(url);
    this.proofUrl.set(null);
  }
}
