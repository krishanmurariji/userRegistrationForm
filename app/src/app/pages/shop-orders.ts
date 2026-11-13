import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonBackButton, IonBadge, IonButtons, IonContent, IonHeader, IonItem, IonLabel, IonList, IonSegment, IonSegmentButton, IonSpinner, IonText, IonTitle, IonToolbar } from '@ionic/angular';
import { toApiError } from '../core/api-error';
import { ShopService } from '../core/shop.service';
import { OrderSummary, paymentColor, paymentLabel, statusColor, statusLabel } from '../core/store.models';

type View = 'new' | 'payments' | 'active' | 'done' | '';

/** A shop's orders, grouped by what needs doing. */
@Component({
  selector: 'app-shop-orders',
  imports: [CurrencyPipe, DatePipe, RouterLink, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonSegment, IonSegmentButton, IonLabel, IonContent, IonList, IonItem, IonBadge, IonSpinner, IonText],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button [defaultHref]="'/shops/' + shopId" /></ion-buttons>
        <ion-title>Orders</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="view()" (ionChange)="view.set($any($event.detail.value)); load()" [scrollable]="true">
          <ion-segment-button value="new"><ion-label>New{{ counts().new ? ' (' + counts().new + ')' : '' }}</ion-label></ion-segment-button>
          <ion-segment-button value="payments"><ion-label>Payments{{ counts().payments ? ' (' + counts().payments + ')' : '' }}</ion-label></ion-segment-button>
          <ion-segment-button value="active"><ion-label>In progress{{ counts().active ? ' (' + counts().active + ')' : '' }}</ion-label></ion-segment-button>
          <ion-segment-button value="done"><ion-label>Done</ion-label></ion-segment-button>
          <ion-segment-button value=""><ion-label>All</ion-label></ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <main class="page-column">
        @if (error(); as message) {
          <ion-text color="danger" role="alert"><p>{{ message }}</p></ion-text>
        }
        @if (loading()) {
          <div class="centered"><ion-spinner name="crescent" aria-label="Loading orders" /></div>
        } @else if (orders().length === 0) {
          <p class="muted">{{ emptyText() }}</p>
        } @else {
          <ion-list>
            @for (order of orders(); track order.id) {
              <ion-item [routerLink]="['/shops', shopId, 'orders', order.id]" detail>
                <ion-label>
                  <h2>{{ order.number }} · {{ order.customerName }}</h2>
                  <p>{{ order.itemCount }} {{ order.itemCount === 1 ? 'item' : 'items' }} · <strong>{{ order.total | currency: 'INR' : 'symbol' : '1.0-2' }}</strong></p>
                  <p class="meta">{{ order.createdAt | date: 'd MMM, h:mm a' }}</p>
                  <div class="badges">
                    <ion-badge [color]="statusColor(order.status)">{{ order.status === 'Placed' ? 'New' : statusLabel(order.status) }}</ion-badge>
                    <ion-badge [color]="paymentColor(order)">{{ paymentLabel(order) }}</ion-badge>
                  </div>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        }
      </main>
    </ion-content>
  `,
})
export class ShopOrdersPage {
  private readonly shops = inject(ShopService);

  protected readonly shopId = inject(ActivatedRoute).snapshot.paramMap.get('shopId')!;
  protected readonly view = signal<View>('new');
  protected readonly orders = signal<OrderSummary[]>([]);
  protected readonly counts = signal({ new: 0, active: 0, payments: 0 });
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly statusLabel = statusLabel;
  protected readonly statusColor = statusColor;
  protected readonly paymentLabel = paymentLabel;
  protected readonly paymentColor = paymentColor;
  private latest = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  ionViewWillEnter(): void {
    void this.load();
    // New orders arrive while the page is open.
    this.timer = setInterval(() => !document.hidden && void this.load(), 30_000);
  }

  ionViewWillLeave(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  protected emptyText(): string {
    switch (this.view()) {
      case 'new':
        return 'No new orders right now.';
      case 'payments':
        return 'No UPI payments are waiting to be checked.';
      case 'active':
        return 'No orders in progress.';
      default:
        return 'No orders here yet.';
    }
  }

  protected async load(): Promise<void> {
    const request = ++this.latest;
    try {
      const [orders, counts] = await Promise.all([this.shops.orders(this.shopId, this.view()), this.shops.orderCounts(this.shopId)]);
      if (request !== this.latest) return;
      this.orders.set(orders);
      this.counts.set(counts);
      this.error.set('');
    } catch (e) {
      if (request === this.latest) this.error.set(toApiError(e).message);
    } finally {
      if (request === this.latest) this.loading.set(false);
    }
  }
}
