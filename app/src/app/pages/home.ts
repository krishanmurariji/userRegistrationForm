import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonButtons, IonContent, IonHeader, IonToolbar } from '@ionic/angular';
import { toApiError } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { AppIcon } from '../core/icon';
import { NotificationBell } from '../core/notification-bell';
import { Shop } from '../core/shop.models';
import { ShopService, fileUrl } from '../core/shop.service';
import { SkeletonList } from '../core/skeletons';

interface ShopStats {
  newOrders: number;
  inProgress: number;
  payments: number;
  low: number;
}

/** The shop owner's home: their shops, each with what needs attention today. */
@Component({
  selector: 'app-home',
  imports: [RouterLink, NotificationBell, AppIcon, SkeletonList, IonHeader, IonToolbar, IonButtons, IonButton, IonContent],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar>
        <div class="greeting" slot="start">
          <img class="brand-mark" src="brand/logo-mark.svg" alt="Small Mart" />
          <span class="who">
            <small>{{ greeting() }}</small>
            <strong>{{ firstName() }}</strong>
          </span>
        </div>
        <ion-buttons slot="end">
          <app-notification-bell />
          <ion-button routerLink="/account" aria-label="Account" class="bell-button">
            <span slot="icon-only" class="bell"><app-icon name="user" /></span>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="shop-bg">
      <main class="shop-column owner-home">
        <h1 class="hero-title">Your <em>shops</em></h1>

        @if (loading()) {
          <app-skeleton-list [count]="2" />
        } @else if (error(); as message) {
          <div class="card"><p role="alert" class="error-text">{{ message }}</p><button type="button" class="link" (click)="load()">Try again</button></div>
        } @else if (shops().length === 0) {
          <div class="card empty-card tall">
            <span class="empty-art"><app-icon name="storefront" weight="duotone" /></span>
            <p><strong>Open your first shop</strong></p>
            <p>Add your shop, list your items and start taking orders.</p>
            <ion-button routerLink="/shops/new">Open a shop</ion-button>
          </div>
        } @else {
          <div class="owner-shops">
            @for (shop of shops(); track shop.id) {
              <a class="card owner-shop" [routerLink]="['/shops', shop.id]" [class.closed]="!shop.isOpen || !shop.isActive">
                <span class="cover">
                  @if (file(shop.coverUrl); as src) { <img [src]="src" alt="" loading="lazy" /> }
                  @else { <app-icon name="storefront" weight="duotone" /> }
                  @if (!shop.isActive) {
                    <span class="state off">Deactivated</span>
                  } @else {
                    <span class="state" [class.open]="shop.isOpen">{{ shop.isOpen ? 'Open' : 'Closed' }}</span>
                  }
                </span>
                <span class="logo">
                  @if (file(shop.logoUrl); as src) { <img [src]="src" alt="" /> } @else { <app-icon name="storefront" weight="duotone" /> }
                </span>
                <span class="body">
                  <strong>{{ shop.name }}</strong>
                  <small><app-icon name="map-pin" />{{ shop.addressLine }}, {{ shop.city }}</small>
                </span>
                @if (stats()[shop.id]; as st) {
                  <span class="owner-stats">
                    <span class="stat" [class.hot]="st.newOrders"><b>{{ st.newOrders }}</b>New orders</span>
                    <span class="stat"><b>{{ st.inProgress }}</b>In progress</span>
                    <span class="stat" [class.warn]="st.payments"><b>{{ st.payments }}</b>UPI to check</span>
                    <span class="stat" [class.warn]="st.low"><b>{{ st.low }}</b>Low stock</span>
                  </span>
                }
              </a>
            }
            <a class="card owner-new" routerLink="/shops/new">
              <span class="empty-art small"><app-icon name="plus" /></span>
              <strong>Open another shop</strong>
              <small>Each shop has its own items, stock and orders.</small>
            </a>
          </div>
        }
      </main>
    </ion-content>
  `,
})
export class HomePage {
  private readonly shopService = inject(ShopService);
  protected readonly auth = inject(AuthService);

  protected readonly shops = signal<Shop[]>([]);
  protected readonly stats = signal<Record<string, ShopStats>>({});
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly file = fileUrl;
  protected readonly firstName = computed(() => this.auth.user()?.fullName.trim().split(/\s+/)[0] ?? 'there');

  protected greeting(): string {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  }

  /** Ionic keeps pages alive in the background, so reload every time this page is shown. */
  ionViewWillEnter(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.error.set('');
    try {
      const shops = await this.shopService.myShops();
      this.shops.set(shops);
      // The numbers on each card load on their own, so a slow one never holds up the list.
      for (const shop of shops) {
        void Promise.all([this.shopService.orderCounts(shop.id), this.shopService.stockSummary(shop.id)])
          .then(([counts, stock]) =>
            this.stats.update((all) => ({
              ...all,
              [shop.id]: { newOrders: counts.new, inProgress: counts.active, payments: counts.payments, low: stock.low },
            })),
          )
          .catch(() => undefined);
      }
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.loading.set(false);
    }
  }
}
