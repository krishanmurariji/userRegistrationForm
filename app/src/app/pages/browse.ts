import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBadge, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonSearchbar, IonSpinner, IonText, IonThumbnail, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cartOutline, personCircleOutline, receiptOutline, storefrontOutline } from 'ionicons/icons';
import { toApiError } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { CartService } from '../core/cart.service';
import { fileUrl } from '../core/shop.service';
import { StoreShop } from '../core/store.models';
import { StoreService } from '../core/store.service';

/** The customer home page: shops to order from. */
@Component({
  selector: 'app-browse',
  imports: [RouterLink, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonBadge, IonContent, IonSearchbar, IonList, IonItem, IonLabel, IonThumbnail, IonSpinner, IonText],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Small Mart</ion-title>
        <ion-buttons slot="end">
          <ion-button routerLink="/orders" aria-label="My orders"><ion-icon slot="icon-only" name="receipt-outline" /></ion-button>
          <ion-button routerLink="/cart" [attr.aria-label]="'Cart, ' + cart.count() + ' items'" class="cart-button">
            <ion-icon slot="icon-only" name="cart-outline" />
            @if (cart.count()) { <ion-badge color="warning">{{ cart.count() }}</ion-badge> }
          </ion-button>
          <ion-button routerLink="/account" aria-label="Account"><ion-icon slot="icon-only" name="person-circle-outline" /></ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <main class="page-column">
        @if (auth.isShopOwner()) {
          <ion-button expand="block" fill="outline" routerLink="/my-shops" class="ion-margin-bottom">
            <ion-icon slot="start" name="storefront-outline" />Manage my shops
          </ion-button>
        }
        <ion-searchbar placeholder="Search shops by name, city or pincode" [debounce]="300"
          (ionInput)="search.set($event.detail.value ?? ''); load()" />

        @if (error(); as message) {
          <ion-text color="danger" role="alert"><p>{{ message }}</p></ion-text>
          <ion-button fill="outline" (click)="load()">Try again</ion-button>
        } @else if (loading()) {
          <div class="centered"><ion-spinner name="crescent" aria-label="Loading shops" /></div>
        } @else if (shops().length === 0) {
          <p class="muted">{{ search() ? 'No shops match your search.' : 'No shops are available yet. Please check back soon.' }}</p>
        } @else {
          <ion-list>
            @for (shop of shops(); track shop.id) {
              <ion-item [routerLink]="['/store', shop.id]" detail>
                <ion-thumbnail slot="start" class="thumb">
                  @if (logo(shop); as src) { <img [src]="src" alt="" /> }
                  @else { <ion-icon name="storefront-outline" aria-hidden="true" /> }
                </ion-thumbnail>
                <ion-label>
                  <h2>{{ shop.name }}</h2>
                  <p>{{ shop.addressLine }}, {{ shop.city }} {{ shop.pincode }}</p>
                  <p class="meta">
                    {{ shop.deliveryFee ? 'Delivery ₹' + shop.deliveryFee : 'Free delivery' }}
                    @if (shop.minimumOrder) { · Minimum order ₹{{ shop.minimumOrder }} }
                  </p>
                </ion-label>
                <ion-badge slot="end" [color]="shop.isOpen ? 'success' : 'medium'">{{ shop.isOpen ? 'Open' : 'Closed' }}</ion-badge>
              </ion-item>
            }
          </ion-list>
        }
      </main>
    </ion-content>
  `,
})
export class BrowsePage {
  private readonly store = inject(StoreService);
  protected readonly auth = inject(AuthService);
  protected readonly cart = inject(CartService);

  protected readonly shops = signal<StoreShop[]>([]);
  protected readonly search = signal('');
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly logo = (shop: StoreShop) => fileUrl(shop.logoUrl);
  private latest = 0;

  constructor() {
    addIcons({ cartOutline, personCircleOutline, receiptOutline, storefrontOutline });
  }

  ionViewWillEnter(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    const request = ++this.latest;
    this.error.set('');
    try {
      const shops = await this.store.shops(this.search());
      if (request === this.latest) this.shops.set(shops);
    } catch (e) {
      if (request === this.latest) this.error.set(toApiError(e).message);
    } finally {
      if (request === this.latest) this.loading.set(false);
    }
  }
}
