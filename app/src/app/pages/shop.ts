import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonInput, IonSearchbar, IonTitle, IonToggle, IonToolbar } from '@ionic/angular';
import { toApiError } from '../core/api-error';
import { categoryIcon } from '../core/category-icon';
import { AppIcon } from '../core/icon';
import { SkeletonList } from '../core/skeletons';
import { Category, Item, Shop, stockState } from '../core/shop.models';
import { NotificationBell } from '../core/notification-bell';
import { PhotoEntry, PhotoPicker, photoFromFile, releasePhoto } from '../core/photo-picker';
import { ShopService, fileUrl } from '../core/shop.service';

/** A shop's management page: open/closed switch, categories and the item list. */
@Component({
  selector: 'app-shop',
  imports: [CurrencyPipe, ReactiveFormsModule, RouterLink, NotificationBell, PhotoPicker, AppIcon, SkeletonList, IonInput, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonButton, IonContent, IonToggle, IonSearchbar, IonFab, IonFabButton],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/my-shops" text="" /></ion-buttons>
        <ion-title>{{ shop()?.name ?? 'Shop' }}</ion-title>
        <ion-buttons slot="end">
          <app-notification-bell />
          <ion-button class="bell-button" [routerLink]="['/shops', shopId, 'edit']" aria-label="Edit shop details">
            <span slot="icon-only" class="bell"><app-icon name="pen" /></span>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="shop-bg">
      <main class="shop-column owner-dash">
        @if (error(); as message) {
          <div class="card"><p role="alert" class="error-text">{{ message }}</p></div>
        }
        @if (shop(); as s) {
          @if (!s.isActive) {
            <div class="card closed-note" role="status">
              <strong>This shop has been deactivated by the platform admin.</strong>
              Customers cannot see it and it cannot be changed. Contact support to have it activated again.
            </div>
          }

          <section class="owner-hero" [class.has-cover]="!!file(s.coverUrl)">
            @if (file(s.coverUrl); as cover) { <img class="cover" [src]="cover" alt="" /> }
            <div class="owner-hero-row">
              <span class="logo">
                @if (file(s.logoUrl); as src) { <img [src]="src" alt="" /> } @else { <app-icon name="storefront" weight="duotone" /> }
              </span>
              <div class="who">
                <h1>{{ s.name }}</h1>
                <p><app-icon name="map-pin" />{{ s.addressLine }}, {{ s.city }}</p>
              </div>
            </div>
            <label class="open-switch" [class.on]="s.isOpen">
              <span class="dot" aria-hidden="true"></span>
              <span class="what"><strong>{{ s.isOpen ? 'Open for orders' : 'Closed' }}</strong>
                <small>{{ s.isOpen ? 'Customers can order now' : 'Customers can look but not order' }}</small></span>
              <ion-toggle [checked]="s.isOpen" [disabled]="saving() || !s.isActive" (ionChange)="setOpen($event.detail.checked)" aria-label="Open for orders" />
            </label>
          </section>

          <section class="owner-tiles" aria-label="Today">
            <a class="tile" [class.hot]="counts().new" [routerLink]="['/shops', shopId, 'orders']" [queryParams]="{ view: 'new' }">
              <span class="tile-icon"><app-icon name="bell" weight="duotone" /></span>
              <b>{{ counts().new }}</b><span>New orders</span>
            </a>
            <a class="tile" [routerLink]="['/shops', shopId, 'orders']" [queryParams]="{ view: 'active' }">
              <span class="tile-icon"><app-icon name="moped" weight="duotone" /></span>
              <b>{{ counts().active }}</b><span>In progress</span>
            </a>
            <a class="tile" [class.warn]="counts().payments" [routerLink]="['/shops', shopId, 'orders']" [queryParams]="{ view: 'payments' }">
              <span class="tile-icon"><app-icon name="qr-code" weight="duotone" /></span>
              <b>{{ counts().payments }}</b><span>UPI to check</span>
            </a>
            <button type="button" class="tile" [class.warn]="lowStock()" [class.on]="lowOnly()" (click)="lowOnly() ? filter(null) : showLow()">
              <span class="tile-icon"><app-icon name="package" weight="duotone" /></span>
              <b>{{ lowStock() }}</b><span>Low stock</span>
            </button>
          </section>

          <nav class="owner-actions" aria-label="Shop tasks">
            @if (s.isActive) {
              <a [routerLink]="['/shops', shopId, 'items', 'new']"><span class="act-icon primary"><app-icon name="plus" /></span>Add item</a>
              <a [routerLink]="['/shops', shopId, 'scan']"><span class="act-icon"><app-icon name="sparkle" weight="duotone" /></span>From a photo</a>
              <button type="button" [class.on]="quickOpen()" [attr.aria-expanded]="quickOpen()" (click)="quickOpen.set(!quickOpen())">
                <span class="act-icon"><app-icon name="lightning" weight="duotone" /></span>Quick add
              </button>
            }
            <a [routerLink]="['/shops', shopId, 'orders']"><span class="act-icon"><app-icon name="receipt" weight="duotone" /></span>Orders</a>
            <a [routerLink]="['/shops', shopId, 'categories']"><span class="act-icon"><app-icon name="squares-four" weight="duotone" /></span>Categories<small>{{ categories().length }}</small></a>
            <a [routerLink]="['/shops', shopId, 'edit']"><span class="act-icon"><app-icon name="storefront" weight="duotone" /></span>Shop details</a>
          </nav>

          @if (quickOpen() && s.isActive) {
            <form class="card quick-add" [formGroup]="quick" (ngSubmit)="quickAdd()" novalidate>
              <h2><span class="head-icon"><app-icon name="lightning" weight="duotone" /></span>Quick add</h2>
              <p class="hint">Type items one after another. MRP, barcode and stock can be added later by opening the item.</p>
              <app-photo-picker label="Pictures" [photos]="quickPhotos()" [busy]="quickBusy()"
                (add)="addQuickPhotos($event)" (remove)="removeQuickPhoto($event)" (makeCover)="coverQuickPhoto($event)"
                (problem)="quickError.set($event)" />
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
              @if (quickError(); as message) { <p role="alert" class="error-text">{{ message }}</p> }
              @if (quickAdded(); as name) { <p role="status" class="ok-text"><app-icon name="check" />Added {{ name }}. Type the next one.</p> }
              <ion-button type="submit" expand="block" [disabled]="quickBusy()">Add and continue</ion-button>
            </form>
          }

          <section class="owner-items">
            <header class="owner-items-head">
              <h2>Items <small>{{ items().length }}{{ items().length === 100 ? '+' : '' }}</small></h2>
            </header>
            <ion-searchbar class="owner-search" placeholder="Search by name or barcode" [debounce]="300"
              (ionInput)="search.set($event.detail.value ?? ''); loadItems()" />
            @if (categories().length || lowStock()) {
              <div class="pills" role="group" aria-label="Filter items">
                <button type="button" [class.on]="categoryId() === null && !lowOnly()" (click)="filter(null)">All</button>
                @if (lowStock()) {
                  <button type="button" class="warn" [class.on]="lowOnly()" (click)="showLow()"><app-icon name="package" weight="duotone" />Low stock ({{ lowStock() }})</button>
                }
                @for (c of categories(); track c.id) {
                  <button type="button" [class.on]="categoryId() === c.id" (click)="filter(c.id)"><app-icon [name]="icon(c.name)" weight="duotone" />{{ c.name }}</button>
                }
              </div>
            }

            @if (loadingItems()) {
              <app-skeleton-list [count]="4" />
            } @else if (items().length === 0) {
              <div class="card empty-card">
                <span class="empty-art small"><app-icon name="basket" weight="duotone" /></span>
                <p>{{ search() || categoryId() || lowOnly() ? 'No items match.' : 'No items yet. Add your first item to start selling.' }}</p>
              </div>
            } @else {
              <ul class="owner-item-list">
                @for (item of items(); track item.id) {
                  <li>
                    <a class="owner-item" [routerLink]="['/shops', shopId, 'items', item.id]" [class.hidden-item]="!item.isActive">
                      <span class="thumb">
                        @if (image(item); as src) { <img [src]="src" alt="" loading="lazy" /> } @else { <app-icon name="basket" weight="duotone" /> }
                      </span>
                      <span class="what">
                        <strong>{{ item.name }}</strong>
                        <small>{{ item.unit }} · <b>{{ item.price | currency: 'INR' : 'symbol' : '1.0-2' }}</b>
                          @if (item.mrp && item.mrp > item.price) { <s>{{ item.mrp | currency: 'INR' : 'symbol' : '1.0-2' }}</s> }</small>
                      </span>
                      <span class="flags">
                        @if (!item.isActive) { <span class="flag muted">Hidden</span> }
                        @if (stock(item); as st) { <span class="flag" [attr.data-color]="st.color">{{ st.label }}</span> }
                      </span>
                      <app-icon class="go" name="caret-right" />
                    </a>
                  </li>
                }
              </ul>
            }
          </section>
        } @else if (!error()) {
          <app-skeleton-list [count]="3" />
        }
      </main>
      @if (shop()?.isActive) {
        <ion-fab slot="fixed" vertical="bottom" horizontal="end" class="owner-fab">
          <ion-fab-button [routerLink]="['/shops', shopId, 'items', 'new']" aria-label="Add item">
            <app-icon name="plus" />
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
  protected readonly file = fileUrl;
  protected readonly icon = categoryIcon;
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
  /** Pictures of the item being typed. Each item needs at least one. */
  protected readonly quickPhotos = signal<PhotoEntry[]>([]);
  private latestItemsRequest = 0;

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
    if (this.quickPhotos().length === 0) {
      this.quickError.set('Add at least one picture of the item.');
      return;
    }
    if (this.quick.invalid || this.quickBusy()) return;
    this.quickBusy.set(true);
    this.quickError.set('');
    this.quickAdded.set('');
    try {
      const v = this.quick.getRawValue();
      // Upload the pictures first. One that already went up on an earlier try is not sent again.
      const ready = [...this.quickPhotos()];
      for (let index = 0; index < ready.length; index++) {
        if (ready[index].id) continue;
        ready[index] = { ...ready[index], id: (await this.shops.stageImage(this.shopId, ready[index].file!)).id };
        this.quickPhotos.set([...ready]);
      }
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
        imageIds: ready.map((p) => p.id!),
      });
      this.quickAdded.set(item.name);
      this.quickPhotos.set([]);
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

  protected addQuickPhotos(files: File[]): void {
    this.quickError.set('');
    this.quickPhotos.update((list) => [...list, ...files.map(photoFromFile)]);
  }

  protected removeQuickPhoto(entry: PhotoEntry): void {
    releasePhoto(entry);
    if (entry.id) void this.shops.discardStagedImage(this.shopId, entry.id).catch(() => undefined);
    this.quickPhotos.update((list) => list.filter((p) => p.key !== entry.key));
  }

  protected coverQuickPhoto(entry: PhotoEntry): void {
    this.quickPhotos.update((list) => [entry, ...list.filter((p) => p.key !== entry.key)]);
  }

  protected async setOpen(isOpen: boolean): Promise<void> {
    const shop = this.shop();
    if (!shop || shop.isOpen === isOpen) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const { id, logoUrl, coverUrl, myRole, isActive, ...input } = shop;
      this.shop.set(await this.shops.updateShop(id, { ...input, isOpen }));
    } catch (e) {
      this.shop.set({ ...shop }); // put the switch back
      this.error.set(toApiError(e).message);
    } finally {
      this.saving.set(false);
    }
  }
}
