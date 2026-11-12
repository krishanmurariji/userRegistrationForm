import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonBackButton, IonBadge, IonButton, IonButtons, IonChip, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonSearchbar, IonSpinner, IonText, IonThumbnail, IonTitle, IonToggle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, createOutline, imageOutline } from 'ionicons/icons';
import { toApiError } from '../core/api-error';
import { Category, Item, Shop } from '../core/shop.models';
import { ShopService, fileUrl } from '../core/shop.service';

/** A shop's management page: open/closed switch, categories and the item list. */
@Component({
  selector: 'app-shop',
  imports: [CurrencyPipe, RouterLink, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonButton, IonIcon, IonContent, IonList, IonItem, IonLabel, IonThumbnail, IonBadge, IonToggle, IonSearchbar, IonChip, IonFab, IonFabButton, IonSpinner, IonText],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/" /></ion-buttons>
        <ion-title>{{ shop()?.name ?? 'Shop' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button [routerLink]="['/shops', shopId, 'edit']" aria-label="Edit shop details">
            <ion-icon slot="icon-only" name="create-outline" />
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
          <ion-list inset class="summary">
            <ion-item>
              <ion-toggle [checked]="s.isOpen" [disabled]="saving()" (ionChange)="setOpen($event.detail.checked)">
                {{ s.isOpen ? 'Open for orders' : 'Closed' }}
              </ion-toggle>
            </ion-item>
            <ion-item [routerLink]="['/shops', shopId, 'categories']" detail lines="none">
              <ion-label>Categories</ion-label>
              <ion-badge slot="end" color="light">{{ categories().length }}</ion-badge>
            </ion-item>
          </ion-list>

          <h2 class="section-title">Items</h2>
          <ion-searchbar placeholder="Search by name or barcode" [debounce]="300"
            (ionInput)="search.set($event.detail.value ?? ''); loadItems()" />
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
            <p class="muted">
              {{ search() || categoryId() ? 'No items match.' : 'No items yet. Tap + to add your first item.' }}
            </p>
          } @else {
            <ion-list>
              @for (item of items(); track item.id) {
                <ion-item [routerLink]="['/shops', shopId, 'items', item.id]" detail>
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
                  </ion-label>
                  @if (!item.isActive) { <ion-badge slot="end" color="medium">Hidden</ion-badge> }
                </ion-item>
              }
            </ion-list>
          }
        } @else if (!error()) {
          <div class="centered"><ion-spinner name="crescent" aria-label="Loading shop" /></div>
        }
      </main>

      @if (shop()) {
        <ion-fab slot="fixed" vertical="bottom" horizontal="end">
          <ion-fab-button [routerLink]="['/shops', shopId, 'items', 'new']" aria-label="Add item">
            <ion-icon name="add-outline" />
          </ion-fab-button>
        </ion-fab>
      }
    </ion-content>
  `,
})
export class ShopPage {
  private readonly shops = inject(ShopService);

  protected readonly shopId = inject(ActivatedRoute).snapshot.paramMap.get('shopId')!;
  protected readonly shop = signal<Shop | null>(null);
  protected readonly categories = signal<Category[]>([]);
  protected readonly items = signal<Item[]>([]);
  protected readonly search = signal('');
  protected readonly categoryId = signal<string | null>(null);
  protected readonly loadingItems = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly image = (item: Item) => fileUrl(item.imageUrl);
  private latestItemsRequest = 0;

  constructor() {
    addIcons({ addOutline, createOutline, imageOutline });
  }

  async ionViewWillEnter(): Promise<void> {
    this.error.set('');
    try {
      const [shop, categories] = await Promise.all([this.shops.shop(this.shopId), this.shops.categories(this.shopId)]);
      this.shop.set(shop);
      this.categories.set(categories);
      if (this.categoryId() && !categories.some((c) => c.id === this.categoryId())) this.categoryId.set(null);
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
    // Typing fast starts several searches; only the newest result may be shown.
    const request = ++this.latestItemsRequest;
    try {
      const items = await this.shops.items(this.shopId, { categoryId: this.categoryId(), search: this.search() });
      if (request === this.latestItemsRequest) this.items.set(items);
    } catch (e) {
      if (request === this.latestItemsRequest) this.error.set(toApiError(e).message);
    } finally {
      if (request === this.latestItemsRequest) this.loadingItems.set(false);
    }
  }

  protected async setOpen(isOpen: boolean): Promise<void> {
    const shop = this.shop();
    if (!shop || shop.isOpen === isOpen) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const { id, logoUrl, myRole, ...input } = shop;
      this.shop.set(await this.shops.updateShop(id, { ...input, isOpen }));
    } catch (e) {
      this.shop.set({ ...shop }); // put the switch back
      this.error.set(toApiError(e).message);
    } finally {
      this.saving.set(false);
    }
  }
}
