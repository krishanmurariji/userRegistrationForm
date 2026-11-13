import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonBackButton, IonBadge, IonButton, IonButtons, IonChip, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonSearchbar, IonSpinner, IonText, IonThumbnail, IonTitle, IonToggle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, createOutline, imageOutline } from 'ionicons/icons';
import { toApiError } from '../core/api-error';
import { Category, Item, Shop, stockState } from '../core/shop.models';
import { NotificationBell } from '../core/notification-bell';
import { ShopService, fileUrl } from '../core/shop.service';

/** A shop's management page: open/closed switch, categories and the item list. */
@Component({
  selector: 'app-shop',
  imports: [CurrencyPipe, ReactiveFormsModule, RouterLink, NotificationBell, IonInput, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonButton, IonIcon, IonContent, IonList, IonItem, IonLabel, IonThumbnail, IonBadge, IonToggle, IonSearchbar, IonChip, IonFab, IonFabButton, IonSpinner, IonText],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/my-shops" /></ion-buttons>
        <ion-title>{{ shop()?.name ?? 'Shop' }}</ion-title>
        <ion-buttons slot="end">
          <app-notification-bell />
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
          @if (!s.isActive) {
            <div class="notice" role="status">
              <strong>This shop has been deactivated by the platform admin.</strong>
              Customers cannot see it and it cannot be changed. Contact support to have it activated again.
            </div>
          }
          <ion-list inset class="summary">
            <ion-item>
              <ion-toggle [checked]="s.isOpen" [disabled]="saving() || !s.isActive" (ionChange)="setOpen($event.detail.checked)">
                {{ s.isOpen ? 'Open for orders' : 'Closed' }}
              </ion-toggle>
            </ion-item>
            <ion-item [routerLink]="['/shops', shopId, 'orders']" detail>
              <ion-label>Orders</ion-label>
              @if (counts().new) { <ion-badge slot="end" color="warning">{{ counts().new }} new</ion-badge> }
              @if (counts().payments) { <ion-badge slot="end" color="danger">{{ counts().payments }} to verify</ion-badge> }
            </ion-item>
            <ion-item [routerLink]="['/shops', shopId, 'categories']" detail lines="none">
              <ion-label>Categories</ion-label>
              <ion-badge slot="end" color="light">{{ categories().length }}</ion-badge>
            </ion-item>
          </ion-list>

          <div class="items-head">
            <h2 class="section-title">Items</h2>
            @if (s.isActive) {
              <ion-button fill="clear" size="small" [attr.aria-expanded]="quickOpen()" (click)="quickOpen.set(!quickOpen())">
                {{ quickOpen() ? 'Close quick add' : 'Quick add' }}
              </ion-button>
            }
          </div>
          @if (quickOpen() && s.isActive) {
            <form class="panel quick-add" [formGroup]="quick" (ngSubmit)="quickAdd()" novalidate>
              <strong>Add items one after another</strong>
              <ion-input #quickName formControlName="name" label="Item name" labelPlacement="stacked" fill="outline" errorText="Enter the item name" />
              <div class="two-columns">
                <ion-input formControlName="price" type="number" inputmode="decimal" min="0" step="0.01"
                  label="Price (₹)" labelPlacement="stacked" fill="outline" errorText="Above 0" />
                <ion-input formControlName="unit" label="Unit" labelPlacement="stacked" fill="outline"
                  placeholder="1 kg, 1 piece" errorText="Enter the unit" />
              </div>
              <ion-input formControlName="category" label="Category (optional)" labelPlacement="stacked" fill="outline"
                placeholder="Existing or new, for example Dairy" maxlength="80" [attr.list]="'quick-categories'" />
              <datalist id="quick-categories">
                @for (c of categories(); track c.id) { <option [value]="c.name"></option> }
              </datalist>
              @if (quickError(); as message) {
                <ion-text color="danger" role="alert"><p class="message">{{ message }}</p></ion-text>
              }
              @if (quickAdded(); as name) {
                <ion-text color="success" role="status"><p class="message">Added {{ name }}. Type the next one.</p></ion-text>
              }
              <ion-button type="submit" expand="block" [disabled]="quickBusy()">Add and continue</ion-button>
              <p class="meta">Photo, MRP, barcode and stock can be added later by opening the item.</p>
            </form>
          }
          <ion-searchbar placeholder="Search by name or barcode" [debounce]="300"
            (ionInput)="search.set($event.detail.value ?? ''); loadItems()" />
          @if (categories().length || lowStock()) {
            <div class="chips" role="group" aria-label="Filter items">
              <ion-chip [outline]="categoryId() !== null || lowOnly()" color="primary" (click)="filter(null)">All</ion-chip>
              @if (lowStock()) {
                <ion-chip [outline]="!lowOnly()" color="danger" (click)="showLow()">Low stock ({{ lowStock() }})</ion-chip>
              }
              @for (c of categories(); track c.id) {
                <ion-chip [outline]="categoryId() !== c.id" color="primary" (click)="filter(c.id)">{{ c.name }}</ion-chip>
              }
            </div>
          }

          @if (loadingItems()) {
            <div class="centered"><ion-spinner name="crescent" aria-label="Loading items" /></div>
          } @else if (items().length === 0) {
            <p class="muted">
              {{ search() || categoryId() || lowOnly() ? 'No items match.' : 'No items yet. Tap + to add your first item.' }}
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
                  @if (stock(item); as st) { <ion-badge slot="end" [color]="st.color">{{ st.label }}</ion-badge> }
                  @if (!item.isActive) { <ion-badge slot="end" color="medium">Hidden</ion-badge> }
                </ion-item>
              }
            </ion-list>
          }
        } @else if (!error()) {
          <div class="centered"><ion-spinner name="crescent" aria-label="Loading shop" /></div>
        }
      </main>

      @if (shop()?.isActive) {
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
  protected readonly counts = signal({ new: 0, active: 0, payments: 0 });
  protected readonly items = signal<Item[]>([]);
  protected readonly search = signal('');
  protected readonly categoryId = signal<string | null>(null);
  protected readonly loadingItems = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly image = (item: Item) => fileUrl(item.imageUrl);
  protected readonly stock = stockState;
  /** How many counted items are at or below their warning level. */
  protected readonly lowStock = signal(0);
  protected readonly lowOnly = signal(false);
  // Quick add: one small form that stays open so items can be typed one after another.
  protected readonly quickOpen = signal(false);
  protected readonly quickBusy = signal(false);
  protected readonly quickError = signal('');
  protected readonly quickAdded = signal('');
  protected readonly quick = inject(FormBuilder).group({
    name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(150)]],
    price: [null as number | null, [Validators.required, Validators.min(0.01), Validators.max(1000000)]],
    unit: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(30)]],
    category: ['', Validators.maxLength(80)],
  });
  private readonly quickName = viewChild<IonInput>('quickName');
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
      void this.shops.orderCounts(this.shopId).then((counts) => this.counts.set(counts)).catch(() => undefined);
      void this.shops.stockSummary(this.shopId).then((summary) => {
        this.lowStock.set(summary.low);
        if (!summary.low) this.lowOnly.set(false);
      }).catch(() => undefined);
      if (this.categoryId() && !categories.some((c) => c.id === this.categoryId())) this.categoryId.set(null);
      await this.loadItems();
    } catch (e) {
      this.error.set(toApiError(e).message);
    }
  }

  protected filter(categoryId: string | null): void {
    this.categoryId.set(categoryId);
    this.lowOnly.set(false);
    void this.loadItems();
  }

  protected showLow(): void {
    this.categoryId.set(null);
    this.lowOnly.set(true);
    void this.loadItems();
  }

  protected async loadItems(): Promise<void> {
    // Typing fast starts several searches; only the newest result may be shown.
    const request = ++this.latestItemsRequest;
    try {
      const items = await this.shops.items(this.shopId, { categoryId: this.categoryId(), search: this.search(), stock: this.lowOnly() ? 'low' : null });
      if (request === this.latestItemsRequest) this.items.set(items);
    } catch (e) {
      if (request === this.latestItemsRequest) this.error.set(toApiError(e).message);
    } finally {
      if (request === this.latestItemsRequest) this.loadingItems.set(false);
    }
  }

  protected async quickAdd(): Promise<void> {
    this.quick.markAllAsTouched();
    if (this.quick.invalid || this.quickBusy()) return;
    this.quickBusy.set(true);
    this.quickError.set('');
    this.quickAdded.set('');
    try {
      const v = this.quick.getRawValue();
      const item = await this.shops.createItem(this.shopId, {
        name: v.name!.trim(),
        categoryId: null,
        newCategoryName: v.category?.trim() || null,
        price: Number(v.price),
        mrp: null,
        unit: v.unit!.trim(),
        barcode: null,
        description: null,
        isActive: true,
        trackStock: false,
        lowStockThreshold: 5,
        openingStock: null,
      });
      this.quickAdded.set(item.name);
      // Keep the unit and category: neighbouring items on a shelf usually share them.
      this.quick.reset({ name: '', price: null, unit: v.unit, category: v.category });
      this.categories.set(await this.shops.categories(this.shopId));
      await this.loadItems();
      await this.quickName()?.setFocus();
    } catch (e) {
      this.quickError.set(toApiError(e).message);
    } finally {
      this.quickBusy.set(false);
    }
  }

  protected async setOpen(isOpen: boolean): Promise<void> {
    const shop = this.shop();
    if (!shop || shop.isOpen === isOpen) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const { id, logoUrl, myRole, isActive, ...input } = shop;
      this.shop.set(await this.shops.updateShop(id, { ...input, isOpen }));
    } catch (e) {
      this.shop.set({ ...shop }); // put the switch back
      this.error.set(toApiError(e).message);
    } finally {
      this.saving.set(false);
    }
  }
}
