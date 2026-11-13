import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { receiptOutline } from 'ionicons/icons';
import { toApiError } from '../core/api-error';
import { BottomNav } from '../core/bottom-nav';
import { NotificationBell } from '../core/notification-bell';
import { OrderSummary, paymentLabel, statusColor, statusLabel } from '../core/store.models';
import { StoreService } from '../core/store.service';

@Component({
  selector: 'app-orders',
  imports: [CurrencyPipe, DatePipe, RouterLink, IonHeader, IonToolbar, IonButtons, IonTitle, IonContent, IonFooter, IonButton, IonIcon, IonSpinner, NotificationBell, BottomNav],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar color="primary">
        <ion-title>My orders</ion-title>
        <ion-buttons slot="end"><app-notification-bell /></ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="shop-bg">
      <main class="shop-column narrow">
        @if (error(); as message) {
          <div class="card"><p role="alert" class="error-text">{{ message }}</p><button type="button" class="link" (click)="load()">Try again</button></div>
        } @else if (loading()) {
          <div class="centered"><ion-spinner name="crescent" aria-label="Loading orders" /></div>
        } @else if (orders().length === 0) {
          <div class="card empty-card tall">
            <ion-icon name="receipt-outline" aria-hidden="true" />
            <p><strong>No orders yet</strong></p>
            <p>Your orders will appear here.</p>
            <ion-button routerLink="/">Browse shops</ion-button>
          </div>
        } @else {
          @for (order of orders(); track order.id) {
            <a class="card order-card" [routerLink]="['/orders', order.id]">
              <span class="top">
                <strong>{{ order.shopName }}</strong>
                <span class="status" [attr.data-color]="statusColor(order.status)">{{ statusLabel(order.status) }}</span>
              </span>
              <span class="mid">{{ order.itemCount }} {{ order.itemCount === 1 ? 'item' : 'items' }} · {{ order.total | currency: 'INR' : 'symbol' : '1.0-2' }} · {{ paymentLabel(order) }}</span>
              <span class="bottom">{{ order.number }} · {{ order.createdAt | date: 'd MMM y, h:mm a' }}<span class="view">View order</span></span>
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

  constructor() {
    addIcons({ receiptOutline });
  }

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
