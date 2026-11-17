import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonFooter, IonHeader, IonSearchbar, IonToolbar } from '@ionic/angular';
import { toApiError } from '../core/api-error';
import { CartBar } from '../core/cart-bar';
import { categoryIcon } from '../core/category-icon';
import { AppIcon } from '../core/icon';
import { ProductCard } from '../core/product-card';
import { ShopCard } from '../core/shop-card';
import { SkeletonProducts } from '../core/skeletons';
import { StoreSearchResult, StoreShop } from '../core/store.models';
import { StoreService } from '../core/store.service';

/** Results across all shops, for a typed search (?q=) or a category tile (?category=). */
@Component({
  selector: 'app-search',
  imports: [RouterLink, IonHeader, IonToolbar, IonButtons, IonBackButton, IonSearchbar, IonContent, IonFooter, ProductCard, CartBar, AppIcon, ShopCard, SkeletonProducts],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar class="search-toolbar with-back">
        <ion-buttons slot="start"><ion-back-button defaultHref="/" text="" /></ion-buttons>
        <form role="search" (submit)="$event.preventDefault()">
          <ion-searchbar placeholder="Search items and shops" enterkeyhint="search" inputmode="search" [debounce]="350"
            [value]="query()" (ionInput)="type($event.detail.value ?? '')" />
        </form>
      </ion-toolbar>
    </ion-header>

    <ion-content class="shop-bg">
      <main class="shop-column">
        @if (category(); as name) {
          <h1 class="page-title with-icon"><span class="head-icon"><app-icon [name]="icon(name)" weight="duotone" /></span>{{ name }}</h1>
        }

        @if (error(); as message) {
          <div class="card"><p role="alert" class="error-text">{{ message }}</p></div>
        } @else if (loading()) {
          <app-skeleton-products />
        } @else if (!query().trim() && !category()) {
          <div class="card empty-card tall"><span class="empty-art"><app-icon name="magnifying-glass" weight="duotone" /></span><p><strong>Search items and shops</strong></p><p>Type what you are looking for.</p></div>
        } @else if (result().items.length === 0 && result().shops.length === 0) {
          <div class="card empty-card tall">
            <span class="empty-art"><app-icon name="magnifying-glass" weight="duotone" /></span>
            <p><strong>Nothing found for "{{ query().trim() || category() }}"</strong></p>
            <p>Check the spelling or try a shorter word.</p>
          </div>
        } @else {
          @if (result().items.length) {
            <h2>{{ result().items.length }} {{ result().items.length === 1 ? 'item' : 'items' }}</h2>
            <div class="product-grid">
              @for (row of result().items; track row.item.id) {
                @if (shopOf(row.shopId); as shop) { <app-product-card [item]="row.item" [shop]="shop" [showShop]="true" /> }
              }
            </div>
          }
          @if (result().shops.length) {
            <h2>Shops</h2>
            <div class="shop-grid">
              @for (shop of result().shops; track shop.id) { <app-shop-card [shop]="shop" /> }
            </div>
          }
        }
      </main>
    </ion-content>
    <ion-footer class="shop-footer"><app-cart-bar /></ion-footer>
  `,
})
export class SearchPage {
  private readonly store = inject(StoreService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly query = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  protected readonly category = signal(this.route.snapshot.queryParamMap.get('category') ?? '');
  protected readonly result = signal<StoreSearchResult>({ items: [], shops: [] });
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly icon = categoryIcon;
  private readonly shopsById = computed(() => new Map(this.result().shops.map((shop) => [shop.id, shop])));
  private latest = 0;


  protected shopOf(id: string): StoreShop | undefined {
    return this.shopsById().get(id);
  }

  ionViewWillEnter(): void {
    void this.run();
  }

  /** Typing replaces a category view with a text search, and keeps the address bar in step. */
  protected type(value: string): void {
    this.query.set(value);
    if (value.trim()) this.category.set('');
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: value.trim() ? { q: value.trim() } : this.category() ? { category: this.category() } : {},
      replaceUrl: true,
    });
    void this.run();
  }

  private async run(): Promise<void> {
    const request = ++this.latest;
    const search = this.query().trim();
    const category = this.category();
    this.error.set('');
    if (!search && !category) {
      this.result.set({ items: [], shops: [] });
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const result = await this.store.search(search ? { search } : { category });
      if (request === this.latest) this.result.set(result);
    } catch (e) {
      if (request === this.latest) this.error.set(toApiError(e).message);
    } finally {
      if (request === this.latest) this.loading.set(false);
    }
  }
}
