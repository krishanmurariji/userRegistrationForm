import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, imageOutline, removeOutline } from 'ionicons/icons';
import { toApiError } from '../core/api-error';
import { CartActions } from '../core/cart-actions';
import { CartBar } from '../core/cart-bar';
import { CartService, maxFor } from '../core/cart.service';
import { fileUrl } from '../core/shop.service';
import { StoreItemDetail, discountPercent } from '../core/store.models';
import { StoreService } from '../core/store.service';

/** One product: a gallery of its pictures, the price and the add-to-cart control. */
@Component({
  selector: 'app-product',
  imports: [CurrencyPipe, RouterLink, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonIcon, IonSpinner, IonFooter, CartBar],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button [defaultHref]="'/store/' + shopId" /></ion-buttons>
        <ion-title>{{ detail()?.item?.name ?? 'Product' }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="shop-bg">
      <main class="shop-column narrow">
        @if (error(); as message) {
          <div class="card"><p role="alert" class="error-text">{{ message }}</p></div>
        } @else if (detail(); as d) {
          <section class="card gallery-card">
            <div class="gallery" role="group" aria-label="Pictures of this product">
              @for (url of pictures(); track url; let index = $index) {
                <img [src]="url" [alt]="d.item.name + ', picture ' + (index + 1) + ' of ' + pictures().length" [class.on]="index === current()" loading="lazy" />
              } @empty {
                <span class="none"><ion-icon name="image-outline" aria-hidden="true" /></span>
              }
              @if (discount(); as percent) { <span class="deal">{{ percent }}% OFF</span> }
            </div>
            @if (pictures().length > 1) {
              <ul class="thumbs" aria-label="Choose a picture">
                @for (url of pictures(); track url; let index = $index) {
                  <li>
                    <button type="button" [class.on]="index === current()" [attr.aria-label]="'Show picture ' + (index + 1)"
                      [attr.aria-pressed]="index === current()" (click)="current.set(index)">
                      <img [src]="url" alt="" loading="lazy" />
                    </button>
                  </li>
                }
              </ul>
            }
          </section>

          <section class="card">
            <h1>{{ d.item.name }}</h1>
            <p class="unit">{{ d.item.unit }}</p>
            <p class="price-line">
              <strong>{{ d.item.price | currency: 'INR' : 'symbol' : '1.0-2' }}</strong>
              @if (discount()) { <s>{{ d.item.mrp | currency: 'INR' : 'symbol' : '1.0-2' }}</s> }
            </p>
            @if (d.item.available !== null && d.item.available > 0 && d.item.available <= 5) { <p class="few">Only {{ d.item.available }} left</p> }
            @if (d.item.description) { <p class="about">{{ d.item.description }}</p> }
            <p class="sold-by">Sold by <a [routerLink]="['/store', d.shop.id]">{{ d.shop.name }}</a>@if (!d.shop.isOpen) { · closed right now }</p>
          </section>
        } @else {
          <div class="centered"><ion-spinner name="crescent" aria-label="Loading" /></div>
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
                <button type="button" aria-label="Remove one" (click)="set(q - 1)"><ion-icon name="remove-outline" /></button>
                <span aria-live="polite">{{ q }}</span>
                <button type="button" [disabled]="q >= max()" aria-label="Add one more" (click)="set(q + 1)"><ion-icon name="add-outline" /></button>
              </span>
            } @else {
              <button type="button" class="add-wide" (click)="set(1)">ADD TO CART</button>
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

  constructor() {
    addIcons({ addOutline, imageOutline, removeOutline });
  }

  async ionViewWillEnter(): Promise<void> {
    this.error.set('');
    try {
      this.detail.set(await this.store.itemDetail(this.shopId, this.itemId));
    } catch (e) {
      this.error.set(toApiError(e).message);
    }
  }

  protected set(quantity: number): void {
    const d = this.detail();
    if (d) void this.actions.set(d.shop, d.item, quantity);
  }
}
