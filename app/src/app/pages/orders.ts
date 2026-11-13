import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonBadge, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonSpinner, IonText, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { receiptOutline } from 'ionicons/icons';
import { toApiError } from '../core/api-error';
import { OrderSummary, paymentColor, paymentLabel, statusColor, statusLabel } from '../core/store.models';
import { StoreService } from '../core/store.service';

@Component({
  selector: 'app-orders',
  imports: [CurrencyPipe, DatePipe, RouterLink, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonList, IonItem, IonLabel, IonBadge, IonButton, IonIcon, IonSpinner, IonText],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/" /></ion-buttons>
        <ion-title>My orders</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <main class="page-column">
        @if (error(); as message) {
          <ion-text color="danger" role="alert"><p>{{ message }}</p></ion-text>
          <ion-button fill="outline" (click)="load()">Try again</ion-button>
        } @else if (loading()) {
          <div class="centered"><ion-spinner name="crescent" aria-label="Loading orders" /></div>
        } @else if (orders().length === 0) {
          <div class="empty">
            <ion-icon name="receipt-outline" aria-hidden="true" />
            <h2>No orders yet</h2>
            <p>Your orders will appear here.</p>
            <ion-button routerLink="/">Browse shops</ion-button>
          </div>
        } @else {
          <ion-list>
            @for (order of orders(); track order.id) {
              <ion-item [routerLink]="['/orders', order.id]" detail>
                <ion-label>
                  <h2>{{ order.shopName }}</h2>
                  <p>{{ order.number }} · {{ order.itemCount }} {{ order.itemCount === 1 ? 'item' : 'items' }} · <strong>{{ order.total | currency: 'INR' : 'symbol' : '1.0-2' }}</strong></p>
                  <p class="meta">{{ order.createdAt | date: 'd MMM y, h:mm a' }}</p>
                  <div class="badges">
                    <ion-badge [color]="statusColor(order.status)">{{ statusLabel(order.status) }}</ion-badge>
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
export class OrdersPage {
  private readonly store = inject(StoreService);

  protected readonly orders = signal<OrderSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly statusLabel = statusLabel;
  protected readonly statusColor = statusColor;
  protected readonly paymentLabel = paymentLabel;
  protected readonly paymentColor = paymentColor;

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
