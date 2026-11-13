import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonSearchbar, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronForward, storefront, storefrontOutline, timeOutline } from 'ionicons/icons';
import { toApiError } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { BottomNav } from '../core/bottom-nav';
import { CartBar } from '../core/cart-bar';
import { NotificationBell } from '../core/notification-bell';
import { fileUrl } from '../core/shop.service';
import { OrderSummary, StoreCategoryTile, StoreShop, statusLabel } from '../core/store.models';
import { StoreService } from '../core/store.service';

/** The customer home page: search, categories, an order in progress, and the shops. */
@Component({
  selector: 'app-browse',
  imports: [RouterLink, IonHeader, IonToolbar, IonTitle, IonButtons, IonIcon, IonContent, IonSearchbar, IonSpinner, IonFooter, NotificationBell, CartBar, BottomNav],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar color="primary">
        <ion-title>Small Mart</ion-title>
        <ion-buttons slot="end"><app-notification-bell /></ion-buttons>
      </ion-toolbar>
      <ion-toolbar color="primary" class="search-toolbar">
        <form role="search" (submit)="search($event)">
          <ion-searchbar placeholder="Search for atta, milk, soap…" enterkeyhint="search" inputmode="search"
            [value]="query()" (ionInput)="query.set($event.detail.value ?? '')" />
        </form>
      </ion-toolbar>
    </ion-header>

    <ion-content class="shop-bg">
      <main class="shop-column">
        <p class="hello">Hello, {{ firstName() }} <span>What do you need today?</span></p>

        @if (auth.isShopOwner()) {
          <a routerLink="/my-shops" class="card strip">
            <ion-icon name="storefront" aria-hidden="true" />
            <span><strong>Manage my shops</strong><small>Items, stock and orders</small></span>
            <ion-icon name="chevron-forward" aria-hidden="true" class="go" />
          </a>
        }
        @if (activeOrder(); as order) {
          <a [routerLink]="['/orders', order.id]" class="card strip tracking">
            <ion-icon name="time-outline" aria-hidden="true" />
            <span><strong>{{ statusLabel(order.status) }}</strong><small>{{ order.number }} from {{ order.shopName }}</small></span>
            <span class="go-text">Track <ion-icon name="chevron-forward" aria-hidden="true" /></span>
          </a>
        }

        @if (error(); as message) {
          <div class="card"><p role="alert" class="error-text">{{ message }}</p><button type="button" class="link" (click)="load()">Try again</button></div>
        } @else if (loading()) {
          <div class="centered"><ion-spinner name="crescent" aria-label="Loading" /></div>
        } @else {
          @if (categories().length) {
            <h2>Shop by category</h2>
            <div class="tiles">
              @for (c of categories(); track c.name) {
                <a class="tile" routerLink="/search" [queryParams]="{ category: c.name }">
                  <span class="pic">
                    @if (file(c.imageUrl); as src) { <img [src]="src" alt="" loading="lazy" /> } @else { <span>{{ c.name.charAt(0) }}</span> }
                  </span>
                  <span class="name">{{ c.name }}</span>
                </a>
              }
            </div>
          }

          <h2>Shops near you</h2>
          @if (shops().length === 0) {
            <div class="card empty-card">
              <ion-icon name="storefront-outline" aria-hidden="true" />
              <p>No shops are available yet. Please check back soon.</p>
            </div>
          } @else {
            <div class="shop-grid">
              @for (shop of shops(); track shop.id) {
                <a class="card shop-card" [routerLink]="['/store', shop.id]" [class.closed]="!shop.isOpen">
                  <span class="logo">
                    @if (file(shop.logoUrl); as src) { <img [src]="src" alt="" loading="lazy" /> }
                    @else { <ion-icon name="storefront-outline" aria-hidden="true" /> }
                  </span>
                  <span class="body">
                    <strong>{{ shop.name }}</strong>
                    <small>{{ shop.addressLine }}, {{ shop.city }}</small>
                    <span class="tags">
                      <span class="tag" [class.open]="shop.isOpen">{{ shop.isOpen ? 'Open' : 'Closed' }}</span>
                      <span class="tag">{{ shop.deliveryFee ? '₹' + shop.deliveryFee + ' delivery' : 'Free delivery' }}</span>
                      @if (shop.minimumOrder) { <span class="tag">Min ₹{{ shop.minimumOrder }}</span> }
                      @if (shop.acceptsUpi) { <span class="tag">UPI</span> }
                    </span>
                  </span>
                  <ion-icon name="chevron-forward" aria-hidden="true" class="go" />
                </a>
              }
            </div>
          }
        }
      </main>
    </ion-content>

    <ion-footer class="shop-footer">
      <app-cart-bar />
      <app-bottom-nav active="home" />
    </ion-footer>
  `,
})
export class BrowsePage {
  private readonly store = inject(StoreService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  protected readonly query = signal('');
  protected readonly shops = signal<StoreShop[]>([]);
  protected readonly categories = signal<StoreCategoryTile[]>([]);
  protected readonly activeOrder = signal<OrderSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly firstName = computed(() => this.auth.user()?.fullName.trim().split(/\s+/)[0] ?? 'there');
  protected readonly file = fileUrl;
  protected readonly statusLabel = statusLabel;

  constructor() {
    addIcons({ chevronForward, storefront, storefrontOutline, timeOutline });
  }

  ionViewWillEnter(): void {
    this.query.set('');
    void this.load();
  }

  protected search(event: Event): void {
    event.preventDefault();
    const q = this.query().trim();
    if (q) void this.router.navigate(['/search'], { queryParams: { q } });
  }

  protected async load(): Promise<void> {
    this.error.set('');
    try {
      const [shops, categories, orders] = await Promise.all([this.store.shops(), this.store.categories(), this.store.myOrders()]);
      this.shops.set(shops);
      this.categories.set(categories.slice(0, 8));
      this.activeOrder.set(orders.find((o) => o.status !== 'Delivered' && o.status !== 'Cancelled') ?? null);
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.loading.set(false);
    }
  }
}
