import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnDestroy, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonBackButton, IonBadge, IonButton, IonButtons, IonContent, IonHeader, IonSpinner, IonText, IonTitle, IonToolbar } from '@ionic/angular';
import { toApiError } from '../core/api-error';
import { OrderView } from '../core/order-view';
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
  imports: [CurrencyPipe, DatePipe, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonBadge, IonButton, IonSpinner, IonText, OrderView],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button [defaultHref]="'/shops/' + shopId + '/orders'" /></ion-buttons>
        <ion-title>{{ order()?.number ?? 'Order' }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <main class="page-column">
        @if (error(); as message) {
          <ion-text color="danger" role="alert"><p>{{ message }}</p></ion-text>
        }
        @if (order(); as o) {
          <h1>{{ o.customerName }}</h1>
          <div class="badges" aria-live="polite">
            <ion-badge [color]="statusColor(o.status)">{{ o.status === 'Placed' ? 'New order' : statusLabel(o.status) }}</ion-badge>
            <ion-badge [color]="paymentColor(o)">{{ paymentLabel(o) }}</ion-badge>
          </div>
          @if (o.status === 'Cancelled' && o.cancelReason) {
            <div class="notice" role="status"><strong>Cancelled</strong>{{ o.cancelReason }}</div>
          }

          @if (o.paymentMethod === 'Upi' && o.status !== 'Cancelled') {
            <section class="panel">
              @switch (o.paymentStatus) {
                @case ('AwaitingVerification') {
                  <strong>Check this UPI payment</strong>
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
                    <ion-button color="success" [disabled]="busy()" (click)="verify()">Payment received</ion-button>
                    <ion-button fill="outline" color="danger" [disabled]="busy()" (click)="reject()">Not received</ion-button>
                  </div>
                }
                @case ('Paid') {
                  <strong>UPI payment confirmed</strong>
                  <p>Transaction ID {{ o.upiReference }}@if (o.paymentVerifiedAt) {, confirmed {{ o.paymentVerifiedAt | date: 'd MMM, h:mm a' }} }.</p>
                }
                @case ('Rejected') {
                  <strong>Payment not found</strong>
                  <p>You told the customer: "{{ o.paymentRejectReason }}". They can send the details again.</p>
                }
                @default {
                  <strong>Waiting for the customer to pay by UPI</strong>
                  <p>You can accept this order once the customer has paid and you have confirmed the payment.</p>
                }
              }
            </section>
          }

          <app-order-view [order]="o" />

          @if (next(); as step) {
            <ion-button expand="block" [disabled]="busy() || blocked()" (click)="advance(step.status)" class="ion-margin-top">
              {{ step.status === 'Delivered' && o.paymentMethod === 'CashOnDelivery' ? 'Delivered, cash collected' : step.label }}
            </ion-button>
            @if (blocked()) { <p class="meta">Confirm the UPI payment first.</p> }
          }
          @if (o.status !== 'Delivered' && o.status !== 'Cancelled') {
            <ion-button expand="block" fill="clear" color="danger" [disabled]="busy()" (click)="cancel()">
              {{ o.status === 'Placed' ? 'Decline order' : 'Cancel order' }}
            </ion-button>
          }
        } @else if (!error()) {
          <div class="centered"><ion-spinner name="crescent" aria-label="Loading order" /></div>
        }
      </main>
    </ion-content>
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
