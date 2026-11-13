import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AlertController, IonBackButton, IonBadge, IonButton, IonButtons, IonChip, IonContent, IonFooter, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonSearchbar, IonSpinner, IonText, IonThumbnail, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, cartOutline, imageOutline, removeOutline } from 'ionicons/icons';
import { toApiError } from '../core/api-error';
import { CartService, maxFor } from '../core/cart.service';
import { fileUrl } from '../core/shop.service';
import { StoreCategory, StoreItem, StoreShop } from '../core/store.models';
import { StoreService } from '../core/store.service';

/** One shop as a customer sees it: its items, with add-to-cart controls. */
@Component({
  selector: 'app-store',
  imports: [CurrencyPipe, RouterLink, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonButton, IonIcon, IonBadge, IonContent, IonSearchbar, IonChip, IonList, IonItem, IonLabel, IonThumbnail, IonSpinner, IonText, IonFooter],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/" /></ion-buttons>
        <ion-title>{{ shop()?.name ?? 'Shop' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button routerLink="/cart" [attr.aria-label]="'Cart, ' + cart.count() + ' items'" class="cart-button">
            <ion-icon slot="icon-only" name="cart-outline" />
            @if (cart.count()) { <ion-badge color="warning">{{ cart.count() }}</ion-badge> }
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <main class="page-column">
        @if (error(); as message) {
          <ion-text color="danger" role="alert"><p>{{ message }}</p></ion-text>
        }
        @if (shop(); as s) {
          <p class="shop-info">
            {{ s.addressLine }}, {{ s.city }} {{ s.pincode }}<br />
            <span class="meta">
              {{ s.deliveryFee ? 'Delivery ₹' + s.deliveryFee : 'Free delivery' }}
              @if (s.minimumOrder) { · Minimum order ₹{{ s.minimumOrder }} }
              · {{ s.acceptsUpi ? 'Cash or UPI' : 'Cash on delivery' }}
            </span>
          </p>
          @if (!s.isOpen) {
            <div class="notice" role="status"><strong>This shop is closed right now.</strong>You can look around, but it is not taking orders.</div>
          }

          <ion-searchbar placeholder="Search items" [debounce]="300" (ionInput)="search.set($event.detail.value ?? ''); loadItems()" />
          @if (categories().length) {
            <div class="chips" role="group" aria-label="Filter by category">
              <ion-chip [outline]="categoryId() !== null" color="primary" (click)="filter(null)">All</ion-chip>
              @for (c of categories(); track c.id) {
                <ion-chip [outline]="categoryId() !== c.id" color="primary" (click)="filter(c.id)">{{ c.name }}</ion-chip>
              }
            </div>
          }

          @if (loadingItems()) {
            <div class="centered"><ion-spinner name="crescent" aria-label="Loading items" /></div>
          } @else if (items().length === 0) {
            <p class="muted">{{ search() || categoryId() ? 'No items match.' : 'This shop has not listed any items yet.' }}</p>
          } @else {
            <ion-list>
              @for (item of items(); track item.id) {
                <ion-item>
                  <ion-thumbnail slot="start" class="thumb">
                    @if (image(item); as src) { <img [src]="src" alt="" /> }
                    @else { <ion-icon name="image-outline" aria-hidden="true" /> }
                  </ion-thumbnail>
                  <ion-label>
                    <h2>{{ item.name }}</h2>
                    <p>
                      {{ item.unit }} · <strong>{{ item.price | currency: 'INR' : 'symbol' : '1.0-2' }}</strong>
                      @if (item.mrp && item.mrp > item.price) {
                        <s class="mrp">{{ item.mrp | currency: 'INR' : 'symbol' : '1.0-2' }}</s>
                      }
                    </p>
                    @if (item.description) { <p class="meta">{{ item.description }}</p> }
                    @if (item.available !== null && item.available > 0 && item.available <= 5) {
                      <p class="only-left">Only {{ item.available }} left</p>
                    }
                  </ion-label>
                  @if (item.available === 0) {
                    <ion-badge slot="end" color="medium">Out of stock</ion-badge>
                  } @else if (!s.isOpen) {
                    <!-- no ordering while closed -->
                  } @else if (cart.quantityOf(item.id); as quantity) {
                    <div slot="end" class="stepper">
                      <ion-button fill="outline" size="small" [attr.aria-label]="'Remove one ' + item.name" (click)="set(item, quantity - 1)">
                        <ion-icon slot="icon-only" name="remove-outline" />
                      </ion-button>
                      <span aria-live="polite">{{ quantity }}</span>
                      <ion-button fill="outline" size="small" [disabled]="quantity >= maxFor(item.available)" [attr.aria-label]="'Add one more ' + item.name" (click)="set(item, quantity + 1)">
                        <ion-icon slot="icon-only" name="add-outline" />
                      </ion-button>
                    </div>
                  } @else {
                    <ion-button slot="end" fill="outline" [attr.aria-label]="'Add ' + item.name + ' to cart'" (click)="set(item, 1)">Add</ion-button>
                  }
                </ion-item>
              }
            </ion-list>
          }
        } @else if (!error()) {
          <div class="centered"><ion-spinner name="crescent" aria-label="Loading shop" /></div>
        }
      </main>
    </ion-content>
    @if (cart.count() && cart.cart()?.shop?.id === shopId) {
      <ion-footer>
        <ion-toolbar>
          <ion-button expand="block" routerLink="/cart" class="ion-margin-horizontal">
            View cart · {{ cart.count() }} {{ cart.count() === 1 ? 'item' : 'items' }} · {{ cart.subtotal() | currency: 'INR' : 'symbol' : '1.0-2' }}
          </ion-button>
        </ion-toolbar>
      </ion-footer>
    }
  `,
})
export class StorePage {
  private readonly store = inject(StoreService);
  private readonly alerts = inject(AlertController);
  protected readonly cart = inject(CartService);

  protected readonly shopId = inject(ActivatedRoute).snapshot.paramMap.get('shopId')!;
  protected readonly maxFor = maxFor;
  protected readonly shop = signal<StoreShop | null>(null);
  protected readonly categories = signal<StoreCategory[]>([]);
  protected readonly items = signal<StoreItem[]>([]);
  protected readonly search = signal('');
  protected readonly categoryId = signal<string | null>(null);
  protected readonly loadingItems = signal(true);
  protected readonly error = signal('');
  protected readonly image = (item: StoreItem) => fileUrl(item.imageUrl);
  private latest = 0;

  constructor() {
    addIcons({ addOutline, cartOutline, imageOutline, removeOutline });
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

  protected async set(item: StoreItem, quantity: number): Promise<void> {
    const shop = this.shop();
    if (!shop) return;
    if (quantity > 0 && this.cart.isOtherShop(shop.id)) {
      const alert = await this.alerts.create({
        header: 'Start a new cart?',
        message: `Your cart has items from ${this.cart.cart()!.shop.name}. An order can come from one shop only, so adding this will empty it.`,
        buttons: [{ text: 'Keep my cart', role: 'cancel' }, { text: 'Start new cart', role: 'confirm' }],
      });
      await alert.present();
      if ((await alert.onDidDismiss()).role !== 'confirm') return;
    }
    this.cart.setQuantity(shop, item, quantity);
  }
}
