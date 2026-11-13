import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonBackButton, IonBadge, IonButton, IonButtons, IonContent, IonHeader, IonInput, IonSpinner, IonText, IonTitle, IonToolbar } from '@ionic/angular';
import { toApiError } from '../core/api-error';
import { OrderView } from '../core/order-view';
import { Order, paymentColor, paymentLabel, statusColor, statusLabel } from '../core/store.models';
import { StoreService } from '../core/store.service';

/** A customer's view of one order: where it is, how to pay by UPI, and what was ordered. */
@Component({
  selector: 'app-order',
  imports: [CurrencyPipe, ReactiveFormsModule, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonBadge, IonInput, IonButton, IonSpinner, IonText, OrderView],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/orders" /></ion-buttons>
        <ion-title>{{ order()?.number ?? 'Order' }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <main class="page-column">
        @if (error(); as message) {
          <ion-text color="danger" role="alert"><p>{{ message }}</p></ion-text>
        }
        @if (order(); as o) {
          <h1>{{ o.shopName }}</h1>
          <div class="badges" aria-live="polite">
            <ion-badge [color]="statusColor(o.status)">{{ statusLabel(o.status) }}</ion-badge>
            <ion-badge [color]="paymentColor(o)">{{ paymentLabel(o) }}</ion-badge>
          </div>
          @if (o.status === 'Cancelled' && o.cancelReason) {
            <div class="notice" role="status"><strong>This order was cancelled.</strong>{{ o.cancelReason }}</div>
          }

          @if (o.paymentMethod === 'Upi' && o.status !== 'Cancelled') {
            <section class="panel">
              @switch (o.paymentStatus) {
                @case ('Paid') {
                  <strong>Payment confirmed</strong>
                  <p>The shop received {{ o.total | currency: 'INR' : 'symbol' : '1.0-2' }} by UPI (transaction ID {{ o.upiReference }}).</p>
                }
                @case ('AwaitingVerification') {
                  <strong>The shop is checking your payment</strong>
                  <p>You sent transaction ID {{ o.upiReference }}. You will see the result here once the shop has checked.</p>
                }
                @default {
                  @if (o.paymentStatus === 'Rejected') {
                    <div class="notice" role="alert">
                      <strong>The shop could not find your payment.</strong>{{ o.paymentRejectReason }}
                      Check the transaction ID and send it again, or call the shop on {{ o.shopPhone }}.
                    </div>
                  }
                  @if (o.upi; as upi) {
                    <strong>Step 1: pay {{ upi.amount | currency: 'INR' : 'symbol' : '1.0-2' }} by UPI</strong>
                    <p>Pay to <strong class="selectable">{{ upi.upiId }}</strong> ({{ upi.payeeName }}).</p>
                    <div class="upi-pay">
                      @if (qr(); as src) { <img [src]="src" width="180" height="180" alt="UPI QR code for this payment" /> }
                      <div>
                        <ion-button [href]="upi.payUri">Open UPI app</ion-button>
                        <p class="meta">On a computer, scan the QR code with your phone's UPI app. The amount is filled in for you.</p>
                      </div>
                    </div>
                    <strong>Step 2: tell the shop you paid</strong>
                    <form [formGroup]="proof" (ngSubmit)="submitProof()" novalidate class="stack">
                      <ion-input formControlName="reference" label="UPI transaction ID (UTR)" labelPlacement="stacked" fill="outline"
                        autocapitalize="characters" helperText="Shown in your UPI app after paying, usually 12 digits"
                        errorText="Enter the transaction ID from your UPI app" />
                      <div class="photo-row">
                        <ion-button fill="outline" [disabled]="busy()" (click)="picker.click()">
                          {{ screenshot() ? 'Change screenshot' : 'Attach payment screenshot' }}
                        </ion-button>
                        <span class="meta">{{ screenshot()?.name ?? 'No screenshot attached' }}</span>
                        <input #picker type="file" accept="image/jpeg,image/png,image/webp" hidden (change)="pick($event)" />
                      </div>
                      @if (proofError(); as message) {
                        <ion-text color="danger" role="alert"><p class="message">{{ message }}</p></ion-text>
                      }
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

          <app-order-view [order]="o" />

          <p class="meta">Questions about this order? Call {{ o.shopName }} on <a [href]="'tel:' + o.shopPhone">{{ o.shopPhone }}</a>.</p>
          @if (o.status === 'Placed') {
            <ion-button expand="block" fill="outline" color="danger" [disabled]="busy()" (click)="cancel()">Cancel order</ion-button>
          }
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
  private readonly orderId = inject(ActivatedRoute).snapshot.paramMap.get('orderId')!;

  protected readonly order = signal<Order | null>(null);
  protected readonly qr = signal<string | null>(null);
  protected readonly screenshot = signal<File | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly proofError = signal('');
  protected readonly proof = inject(FormBuilder).nonNullable.group({
    reference: ['', [Validators.required, Validators.pattern(/^\s*[A-Za-z0-9]{8,35}\s*$/)]],
  });
  protected readonly statusLabel = statusLabel;
  protected readonly statusColor = statusColor;
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
