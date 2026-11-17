import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonButtons, IonContent, IonFooter, IonHeader, IonSearchbar, IonToolbar } from '@ionic/angular';
import { toApiError } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { BottomNav } from '../core/bottom-nav';
import { CartBar } from '../core/cart-bar';
import { categoryIcon } from '../core/category-icon';
import { AppIcon } from '../core/icon';
import { ShopCard } from '../core/shop-card';
import { SkeletonList } from '../core/skeletons';
import { NotificationBell } from '../core/notification-bell';
import { OrderSummary, StoreCategoryTile, StoreShop, statusLabel } from '../core/store.models';
import { StoreService } from '../core/store.service';

/** The customer home page: search, categories, an order in progress, and the shops. */
@Component({
  selector: 'app-browse',
  imports: [RouterLink, IonHeader, IonToolbar, IonButtons, IonContent, IonSearchbar, IonFooter, NotificationBell, CartBar, BottomNav, AppIcon, SkeletonList, ShopCard],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar>
        <div class="greeting" slot="start">
          <span class="brand-mark"><app-icon name="shopping-bag" weight="duotone" /></span>
          <span class="who">
            <small>Welcome back</small>
            <strong>{{ firstName() }}</strong>
          </span>
        </div>
        <ion-buttons slot="end"><app-notification-bell /></ion-buttons>
      </ion-toolbar>
      <ion-toolbar class="search-toolbar">
        <form role="search" (submit)="search($event)">
          <ion-searchbar placeholder="Search for atta, milk, soap…" enterkeyhint="search" inputmode="search"
            [value]="query()" (ionInput)="query.set($event.detail.value ?? '')" />
        </form>
      </ion-toolbar>
    </ion-header>

    <ion-content class="shop-bg">
      <main class="shop-column home">
        <h1 class="hero-title">What do you need <em>today?</em></h1>

        @if (activeOrder(); as order) {
          <a [routerLink]="['/orders', order.id]" class="card strip tracking">
            <span class="strip-icon"><app-icon name="moped" weight="duotone" /></span>
            <span><strong>{{ statusLabel(order.status) }}</strong><small>{{ order.number }} from {{ order.shopName }}</small></span>
            <span class="go-text">Track <app-icon name="caret-right" /></span>
          </a>
        }

        @if (error(); as message) {
          <div class="card"><p role="alert" class="error-text">{{ message }}</p><button type="button" class="link" (click)="load()">Try again</button></div>
        } @else if (loading()) {
          <app-skeleton-list [count]="3" />
        } @else {
          @if (categories().length) {
            <h2>Shop by category</h2>
            <div class="rail" role="list">
              @for (c of categories(); track c.name) {
                <a class="tile" role="listitem" routerLink="/search" [queryParams]="{ category: c.name }">
                  <span class="pic"><app-icon [name]="icon(c.name)" weight="duotone" /></span>
                  <span class="name">{{ c.name }}</span>
                </a>
              }
            </div>
          }

          <h2>Shops near you</h2>
          @if (shops().length === 0) {
            <div class="card empty-card">
              <app-icon name="storefront" weight="duotone" />
              <p>No shops are available yet. Please check back soon.</p>
            </div>
          } @else {
            <div class="shop-grid">
              @for (shop of shops(); track shop.id) { <app-shop-card [shop]="shop" /> }
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
  protected readonly icon = categoryIcon;
  protected readonly statusLabel = statusLabel;

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
