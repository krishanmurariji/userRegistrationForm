import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';
import { toApiError } from '../core/api-error';
import { BottomNav } from '../core/bottom-nav';
import { AppIcon } from '../core/icon';
import { SkeletonList } from '../core/skeletons';
import { NotificationBell } from '../core/notification-bell';
import { OrderStatus, OrderSummary, paymentLabel, statusColor, statusLabel } from '../core/store.models';
import { StoreService } from '../core/store.service';

@Component({
  selector: 'app-orders',
  imports: [CurrencyPipe, DatePipe, RouterLink, IonHeader, IonToolbar, IonButtons, IonTitle, IonContent, IonFooter, IonButton, NotificationBell, BottomNav, AppIcon, SkeletonList],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar>
        <ion-title>My orders</ion-title>
        <ion-buttons slot="end"><app-notification-bell /></ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="shop-bg">
      <main class="shop-column narrow">
        @if (error(); as message) {
          <div class="card"><p role="alert" class="error-text">{{ message }}</p><button type="button" class="link" (click)="load()">Try again</button></div>
        } @else if (loading()) {
          <app-skeleton-list [count]="4" />
        } @else if (orders().length === 0) {
          <div class="card empty-card tall">
            <span class="empty-art"><app-icon name="receipt" weight="duotone" /></span>
            <p><strong>No orders yet</strong></p>
            <p>Your orders will appear here.</p>
            <ion-button routerLink="/">Browse shops</ion-button>
          </div>
        } @else {
          @for (order of orders(); track order.id) {
            <a class="card order-card" [routerLink]="['/orders', order.id]" [class.live]="isLive(order.status)">
              <span class="top">
                <span class="order-icon" [attr.data-color]="statusColor(order.status)"><app-icon [name]="icon(order.status)" weight="duotone" /></span>
                <strong>{{ order.shopName }}</strong>
                <span class="status" [attr.data-color]="statusColor(order.status)">{{ statusLabel(order.status) }}</span>
              </span>
              <span class="mid">{{ order.itemCount }} {{ order.itemCount === 1 ? 'item' : 'items' }} · {{ order.total | currency: 'INR' : 'symbol' : '1.0-2' }} · {{ paymentLabel(order) }}</span>
              <span class="bottom">{{ order.number }} · {{ order.createdAt | date: 'd MMM y, h:mm a' }}<span class="view">{{ isLive(order.status) ? 'Track' : 'View' }}<app-icon name="caret-right" /></span></span>
              @if (isLive(order.status)) { <span class="mini-road" aria-hidden="true"><i [style.transform]="'scaleX(' + progress(order.status) + ')'"></i></span> }
            </a>
          }
        }
      </main>
    </ion-content>
    <ion-footer class="shop-footer"><app-bottom-nav active="orders" /></ion-footer>
  `,
})
export class OrdersPage {
  private readonly store = inject(StoreService);

  protected readonly orders = signal<OrderSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly statusLabel = statusLabel;
  protected readonly statusColor = statusColor;
  protected readonly paymentLabel = paymentLabel;

  private static readonly order: OrderStatus[] = ['Placed', 'Accepted', 'Packed', 'OutForDelivery', 'Delivered'];
  private static readonly icons: Record<OrderStatus, string> = {
    Placed: 'receipt', Accepted: 'seal-check', Packed: 'package', OutForDelivery: 'moped', Delivered: 'house', Cancelled: 'x-circle',
  };

  protected readonly icon = (status: OrderStatus) => OrdersPage.icons[status];
  protected readonly isLive = (status: OrderStatus) => status !== 'Delivered' && status !== 'Cancelled';
  /** How far along an order in progress is, from 0 to 1 (never empty, so the bar is always visible). */
  protected readonly progress = (status: OrderStatus) => Math.max(0.12, OrdersPage.order.indexOf(status) / 4);

  ionViewWillEnter(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.error.set('');
    try {
      this.orders.set(await this.store.myOrders());
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.loading.set(false);
    }
  }
}
