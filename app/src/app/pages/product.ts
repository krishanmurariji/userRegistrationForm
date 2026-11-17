import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonFooter, IonHeader, IonSkeletonText, IonTitle, IonToolbar } from '@ionic/angular';
import { toApiError } from '../core/api-error';
import { CartActions } from '../core/cart-actions';
import { CartBar } from '../core/cart-bar';
import { CartService, maxFor } from '../core/cart.service';
import { AppIcon } from '../core/icon';
import { fileUrl } from '../core/shop.service';
import { StoreItemDetail, discountPercent } from '../core/store.models';
import { StoreService } from '../core/store.service';

/** One product: a gallery of its pictures, the price and the add-to-cart control. */
@Component({
  selector: 'app-product',
  imports: [CurrencyPipe, RouterLink, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonSkeletonText, IonFooter, CartBar, AppIcon],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button [defaultHref]="'/store/' + shopId" text="" /></ion-buttons>
        <ion-title>{{ detail()?.item?.name ?? 'Product' }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="shop-bg">
      <main class="shop-column narrow product-page">
        @if (error(); as message) {
          <div class="card"><p role="alert" class="error-text">{{ message }}</p></div>
        } @else if (detail(); as d) {
          <section class="gallery-card">
            <div #scroller class="gallery" role="group" aria-label="Pictures of this product" tabindex="0" (scroll)="onScroll(scroller)">
              @for (url of pictures(); track url; let index = $index) {
                <img [src]="url" [alt]="d.item.name + ', picture ' + (index + 1) + ' of ' + pictures().length" [attr.loading]="index ? 'lazy' : 'eager'" />
              } @empty {
                <span class="none"><app-icon name="basket" weight="duotone" /></span>
              }
            </div>
            @if (discount(); as percent) { <span class="deal">{{ percent }}% off</span> }
            @if (pictures().length > 1) {
              <div class="dots" aria-hidden="true">
                @for (url of pictures(); track url; let index = $index) { <i [class.on]="index === current()"></i> }
              </div>
              <ul class="thumbs" aria-label="Choose a picture">
                @for (url of pictures(); track url; let index = $index) {
                  <li>
                    <button type="button" [class.on]="index === current()" [attr.aria-label]="'Show picture ' + (index + 1)"
                      [attr.aria-pressed]="index === current()" (click)="show(index, scroller)">
                      <img [src]="url" alt="" loading="lazy" />
                    </button>
                  </li>
                }
              </ul>
            }
          </section>

          <section class="card info-card">
            <h1>{{ d.item.name }}</h1>
            <p class="unit">{{ d.item.unit }}</p>
            <p class="price-line">
              <strong>{{ d.item.price | currency: 'INR' : 'symbol' : '1.0-2' }}</strong>
              @if (discount()) {
                <s>{{ d.item.mrp | currency: 'INR' : 'symbol' : '1.0-2' }}</s>
                <span class="save"><app-icon name="tag" />Save {{ d.item.mrp! - d.item.price | currency: 'INR' : 'symbol' : '1.0-2' }}</span>
              }
            </p>
            @if (d.item.available !== null && d.item.available > 0 && d.item.available <= 5) { <p class="few">Only {{ d.item.available }} left</p> }
          </section>

          @if (d.item.description) {
            <section class="card">
              <h2>About this item</h2>
              <p class="about">{{ d.item.description }}</p>
            </section>
          }

          <a class="card sold-by-card" [routerLink]="['/store', d.shop.id]">
            <span class="shop-icon"><app-icon name="storefront" weight="duotone" /></span>
            <span class="sold-by"><small>Sold by</small><strong>{{ d.shop.name }}</strong>@if (!d.shop.isOpen) { <small class="closed">Closed right now</small> }</span>
            <span class="go"><app-icon name="caret-right" /></span>
          </a>
        } @else {
          <div class="sk-product" aria-hidden="true">
            <ion-skeleton-text animated class="sk-photo" />
            <ion-skeleton-text animated class="sk-line" />
            <ion-skeleton-text animated class="sk-line short" />
          </div>
        }
      </main>
    </ion-content>

    <ion-footer class="shop-footer">
      @if (detail(); as d) {
        @if (d.item.available === 0) {
          <div class="pay-bar"><span><strong>Out of stock</strong></span></div>
        } @else if (!d.shop.isOpen) {
          <div class="pay-bar"><span><strong>This shop is closed right now</strong></span></div>
        } @else {
          <div class="pay-bar">
            <span><small>Price</small><strong>{{ d.item.price | currency: 'INR' : 'symbol' : '1.0-2' }}</strong></span>
            @if (quantity(); as q) {
              <span class="qty big" role="group" aria-label="Quantity">
                <button type="button" aria-label="Remove one" (click)="set(q - 1)"><app-icon name="minus" /></button>
                <span aria-live="polite">{{ q }}</span>
                <button type="button" [disabled]="q >= max()" aria-label="Add one more" (click)="set(q + 1)"><app-icon name="plus" /></button>
              </span>
            } @else {
              <button type="button" class="add-wide" (click)="set(1)"><app-icon name="shopping-bag" weight="fill" />Add to cart</button>
            }
          </div>
        }
      }
      <app-cart-bar />
    </ion-footer>
  `,
})
export class ProductPage {
  private readonly store = inject(StoreService);
  private readonly cart = inject(CartService);
  private readonly actions = inject(CartActions);
  private readonly params = inject(ActivatedRoute).snapshot.paramMap;

  protected readonly shopId = this.params.get('shopId')!;
  private readonly itemId = this.params.get('itemId')!;
  protected readonly detail = signal<StoreItemDetail | null>(null);
  protected readonly error = signal('');
  protected readonly current = signal(0);
  protected readonly pictures = computed(() => (this.detail()?.imageUrls ?? []).map((url) => fileUrl(url)!));
  protected readonly discount = computed(() => (this.detail() ? discountPercent(this.detail()!.item) : 0));
  protected readonly max = computed(() => maxFor(this.detail()?.item.available));
  protected readonly quantity = computed(() => {
    const d = this.detail();
    return d && this.cart.cart()?.shop.id === d.shop.id ? this.cart.quantityOf(d.item.id) : 0;
  });

  async ionViewWillEnter(): Promise<void> {
    this.error.set('');
    try {
      this.detail.set(await this.store.itemDetail(this.shopId, this.itemId));
    } catch (e) {
      this.error.set(toApiError(e).message);
    }
  }

  /** Swiping the gallery moves the dots and the highlighted thumbnail. */
  protected onScroll(scroller: HTMLElement): void {
    if (scroller.clientWidth) this.current.set(Math.round(scroller.scrollLeft / scroller.clientWidth));
  }

  protected show(index: number, scroller: HTMLElement): void {
    this.current.set(index);
    scroller.scrollTo({ left: index * scroller.clientWidth, behavior: 'smooth' });
  }

  protected set(quantity: number): void {
    const d = this.detail();
    if (d) void this.actions.set(d.shop, d.item, quantity);
  }
}
