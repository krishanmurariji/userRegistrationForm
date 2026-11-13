import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonSearchbar, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { callOutline, locationOutline, searchOutline, storefrontOutline } from 'ionicons/icons';
import { toApiError } from '../core/api-error';
import { CartBar } from '../core/cart-bar';
import { NotificationBell } from '../core/notification-bell';
import { ProductCard } from '../core/product-card';
import { fileUrl } from '../core/shop.service';
import { StoreCategory, StoreItem, StoreShop } from '../core/store.models';
import { StoreService } from '../core/store.service';

/** One shop as a customer sees it: who they are, and a grid of what they sell. */
@Component({
  selector: 'app-store',
  imports: [IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonSearchbar, IonIcon, IonSpinner, IonFooter, NotificationBell, ProductCard, CartBar],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/" /></ion-buttons>
        <ion-title>{{ shop()?.name ?? 'Shop' }}</ion-title>
        <ion-buttons slot="end"><app-notification-bell /></ion-buttons>
      </ion-toolbar>
      <ion-toolbar color="primary" class="search-toolbar">
        <ion-searchbar [placeholder]="'Search in ' + (shop()?.name ?? 'this shop')" [debounce]="300" inputmode="search"
          (ionInput)="search.set($event.detail.value ?? ''); loadItems()" />
      </ion-toolbar>
    </ion-header>

    <ion-content class="shop-bg">
      <main class="shop-column">
        @if (error(); as message) {
          <div class="card"><p role="alert" class="error-text">{{ message }}</p></div>
        }
        @if (shop(); as s) {
          <section class="card shop-hero">
            <span class="logo">
              @if (file(s.logoUrl); as src) { <img [src]="src" alt="" /> } @else { <ion-icon name="storefront-outline" aria-hidden="true" /> }
            </span>
            <div class="body">
              <h1>{{ s.name }}</h1>
              @if (s.description) { <p>{{ s.description }}</p> }
              <p class="line"><ion-icon name="location-outline" aria-hidden="true" />{{ s.addressLine }}, {{ s.city }} {{ s.pincode }}</p>
              <p class="line"><ion-icon name="call-outline" aria-hidden="true" /><a [href]="'tel:' + s.phone">{{ s.phone }}</a></p>
              <div class="tags">
                <span class="tag" [class.open]="s.isOpen">{{ s.isOpen ? 'Open now' : 'Closed' }}</span>
                <span class="tag">{{ s.deliveryFee ? '₹' + s.deliveryFee + ' delivery' : 'Free delivery' }}</span>
                @if (s.minimumOrder) { <span class="tag">Min order ₹{{ s.minimumOrder }}</span> }
                <span class="tag">{{ s.acceptsUpi ? 'Cash or UPI' : 'Cash on delivery' }}</span>
              </div>
            </div>
          </section>
          @if (!s.isOpen) {
            <div class="card closed-note" role="status"><strong>This shop is closed right now.</strong> You can look around, but it is not taking orders.</div>
          }

          @if (categories().length) {
            <div class="pills" role="group" aria-label="Filter by category">
              <button type="button" [class.on]="categoryId() === null" [attr.aria-pressed]="categoryId() === null" (click)="filter(null)">All</button>
              @for (c of categories(); track c.id) {
                <button type="button" [class.on]="categoryId() === c.id" [attr.aria-pressed]="categoryId() === c.id" (click)="filter(c.id)">{{ c.name }}</button>
              }
            </div>
          }

          @if (loadingItems()) {
            <div class="centered"><ion-spinner name="crescent" aria-label="Loading items" /></div>
          } @else if (items().length === 0) {
            <div class="card empty-card">
              <ion-icon name="search-outline" aria-hidden="true" />
              <p>{{ search() || categoryId() ? 'No items match.' : 'This shop has not listed any items yet.' }}</p>
            </div>
          } @else {
            <div class="product-grid">
              @for (item of items(); track item.id) { <app-product-card [item]="item" [shop]="s" /> }
            </div>
          }
        } @else if (!error()) {
          <div class="centered"><ion-spinner name="crescent" aria-label="Loading shop" /></div>
        }
      </main>
    </ion-content>
    <ion-footer class="shop-footer"><app-cart-bar /></ion-footer>
  `,
})
export class StorePage {
  private readonly store = inject(StoreService);

  protected readonly shopId = inject(ActivatedRoute).snapshot.paramMap.get('shopId')!;
  protected readonly shop = signal<StoreShop | null>(null);
  protected readonly categories = signal<StoreCategory[]>([]);
  protected readonly items = signal<StoreItem[]>([]);
  protected readonly search = signal('');
  protected readonly categoryId = signal<string | null>(null);
  protected readonly loadingItems = signal(true);
  protected readonly error = signal('');
  protected readonly file = fileUrl;
  private latest = 0;

  constructor() {
    addIcons({ callOutline, locationOutline, searchOutline, storefrontOutline });
  }

  async ionViewWillEnter(): Promise<void> {
    this.error.set('');
    try {
      const detail = await this.store.shop(this.shopId);
      this.shop.set(detail.shop);
      this.categories.set(detail.categories);
      await this.loadItems();
    } catch (e) {
      this.error.set(toApiError(e).message);
    }
  }

  protected filter(categoryId: string | null): void {
    this.categoryId.set(categoryId);
    void this.loadItems();
  }

  protected async loadItems(): Promise<void> {
    const request = ++this.latest;
    try {
      const items = await this.store.items(this.shopId, { categoryId: this.categoryId(), search: this.search() });
      if (request === this.latest) this.items.set(items);
    } catch (e) {
      if (request === this.latest) this.error.set(toApiError(e).message);
    } finally {
      if (request === this.latest) this.loadingItems.set(false);
    }
  }
}
