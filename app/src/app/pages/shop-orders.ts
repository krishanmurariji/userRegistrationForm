import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';
import { toApiError } from '../core/api-error';
import { AppIcon } from '../core/icon';
import { NotificationBell } from '../core/notification-bell';
import { ShopService } from '../core/shop.service';
import { SkeletonList } from '../core/skeletons';
import { OrderStatus, OrderSummary, paymentColor, paymentLabel, statusColor, statusLabel } from '../core/store.models';

type View = 'new' | 'payments' | 'active' | 'done' | '';

/** A shop's orders, grouped by what needs doing. */
@Component({
  selector: 'app-shop-orders',
  imports: [CurrencyPipe, DatePipe, RouterLink, AppIcon, NotificationBell, SkeletonList, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button [defaultHref]="'/shops/' + shopId" text="" /></ion-buttons>
        <ion-title>Orders</ion-title>
        <ion-buttons slot="end"><app-notification-bell /></ion-buttons>
      </ion-toolbar>
      <ion-toolbar class="tabs-toolbar">
        <div class="owner-tabs" role="tablist" aria-label="Show orders">
          @for (t of tabs; track t.value) {
            <button type="button" role="tab" [attr.aria-selected]="view() === t.value" [class.on]="view() === t.value" (click)="choose(t.value)">
              <app-icon [name]="t.icon" [weight]="view() === t.value ? 'fill' : 'regular'" />{{ t.label }}
              @if (countFor(t.value); as n) { <span class="count" [class.alert]="t.value !== 'active'">{{ n }}</span> }
            </button>
          }
        </div>
      </ion-toolbar>
    </ion-header>
    <ion-content class="shop-bg">
      <main class="shop-column narrow owner-orders">
        @if (error(); as message) {
          <div class="card"><p role="alert" class="error-text">{{ message }}</p></div>
        }
        @if (loading()) {
          <app-skeleton-list [count]="4" />
        } @else if (orders().length === 0) {
          <div class="card empty-card tall">
            <span class="empty-art"><app-icon [name]="view() === 'payments' ? 'qr-code' : 'receipt'" weight="duotone" /></span>
            <p><strong>{{ emptyText() }}</strong></p>
            <p>New orders appear here by themselves; this page checks every 30 seconds.</p>
          </div>
        } @else {
          @for (order of orders(); track order.id) {
            <a class="card order-card owner-order" [routerLink]="['/shops', shopId, 'orders', order.id]" [class.live]="order.status === 'Placed'">
              <span class="top">
                <span class="order-icon" [attr.data-color]="statusColor(order.status)"><app-icon [name]="icon(order.status)" weight="duotone" /></span>
                <span class="who"><strong>{{ order.customerName }}</strong><small>{{ order.number }} · {{ order.createdAt | date: 'd MMM, h:mm a' }}</small></span>
                <span class="amount">{{ order.total | currency: 'INR' : 'symbol' : '1.0-2' }}</span>
              </span>
              <span class="bottom">
                <span>{{ order.itemCount }} {{ order.itemCount === 1 ? 'item' : 'items' }}</span>
                <span class="pills-row">
                  <span class="status" [attr.data-color]="paymentColor(order)">{{ paymentLabel(order) }}</span>
                  <span class="status" [attr.data-color]="statusColor(order.status)">{{ order.status === 'Placed' ? 'New' : statusLabel(order.status) }}</span>
                </span>
              </span>
            </a>
          }
        }
      </main>
    </ion-content>
  `,
})
export class ShopOrdersPage {
  private readonly shops = inject(ShopService);

  private readonly route = inject(ActivatedRoute).snapshot;
  protected readonly shopId = this.route.paramMap.get('shopId')!;
  /** The dashboard's tiles open a chosen tab with ?view=. */
  protected readonly view = signal<View>(((v) => (['new', 'payments', 'active', 'done', ''].includes(v ?? '-') ? v : 'new') as View)(this.route.queryParamMap.get('view')));
  protected readonly tabs: { value: View; label: string; icon: string }[] = [
    { value: 'new', label: 'New', icon: 'bell' },
    { value: 'payments', label: 'UPI to check', icon: 'qr-code' },
    { value: 'active', label: 'In progress', icon: 'moped' },
    { value: 'done', label: 'Done', icon: 'check-circle' },
    { value: '', label: 'All', icon: 'receipt' },
  ];
  private static readonly icons: Record<OrderStatus, string> = {
    Placed: 'bell', Accepted: 'seal-check', Packed: 'package', OutForDelivery: 'moped', Delivered: 'house', Cancelled: 'x-circle',
  };
  protected readonly icon = (status: OrderStatus) => ShopOrdersPage.icons[status];
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

  protected countFor(view: View): number {
    const c = this.counts();
    return view === 'new' ? c.new : view === 'payments' ? c.payments : view === 'active' ? c.active : 0;
  }

  protected choose(view: View): void {
    if (this.view() === view) return;
    this.view.set(view);
    this.loading.set(true);
    void this.load();
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
