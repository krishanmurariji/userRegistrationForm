import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonSearchbar, IonSpinner, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronForward, searchOutline, storefrontOutline } from 'ionicons/icons';
import { toApiError } from '../core/api-error';
import { CartBar } from '../core/cart-bar';
import { ProductCard } from '../core/product-card';
import { fileUrl } from '../core/shop.service';
import { StoreSearchResult, StoreShop } from '../core/store.models';
import { StoreService } from '../core/store.service';

/** Results across all shops, for a typed search (?q=) or a category tile (?category=). */
@Component({
  selector: 'app-search',
  imports: [RouterLink, IonHeader, IonToolbar, IonButtons, IonBackButton, IonSearchbar, IonContent, IonIcon, IonSpinner, IonFooter, ProductCard, CartBar],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar color="primary" class="search-toolbar with-back">
        <ion-buttons slot="start"><ion-back-button defaultHref="/" /></ion-buttons>
        <form role="search" (submit)="$event.preventDefault()">
          <ion-searchbar placeholder="Search items and shops" enterkeyhint="search" inputmode="search" [debounce]="350"
            [value]="query()" (ionInput)="type($event.detail.value ?? '')" />
        </form>
      </ion-toolbar>
    </ion-header>

    <ion-content class="shop-bg">
      <main class="shop-column">
        @if (category(); as name) { <h1 class="page-title">{{ name }}</h1> }

        @if (error(); as message) {
          <div class="card"><p role="alert" class="error-text">{{ message }}</p></div>
        } @else if (loading()) {
          <div class="centered"><ion-spinner name="crescent" aria-label="Searching" /></div>
        } @else if (!query().trim() && !category()) {
          <div class="card empty-card"><ion-icon name="search-outline" aria-hidden="true" /><p>Type what you are looking for.</p></div>
        } @else if (result().items.length === 0 && result().shops.length === 0) {
          <div class="card empty-card">
            <ion-icon name="search-outline" aria-hidden="true" />
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
              @for (shop of result().shops; track shop.id) {
                <a class="card shop-card" [routerLink]="['/store', shop.id]" [class.closed]="!shop.isOpen">
                  <span class="logo">
                    @if (file(shop.logoUrl); as src) { <img [src]="src" alt="" loading="lazy" /> }
                    @else { <ion-icon name="storefront-outline" aria-hidden="true" /> }
                  </span>
                  <span class="body">
                    <strong>{{ shop.name }}</strong>
                    <small>{{ shop.addressLine }}, {{ shop.city }}</small>
                    <span class="tags"><span class="tag" [class.open]="shop.isOpen">{{ shop.isOpen ? 'Open' : 'Closed' }}</span></span>
                  </span>
                  <ion-icon name="chevron-forward" aria-hidden="true" class="go" />
                </a>
              }
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
  protected readonly file = fileUrl;
  private readonly shopsById = computed(() => new Map(this.result().shops.map((shop) => [shop.id, shop])));
  private latest = 0;

  constructor() {
    addIcons({ chevronForward, searchOutline, storefrontOutline });
  }

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
