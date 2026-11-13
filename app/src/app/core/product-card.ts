import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, imageOutline, removeOutline } from 'ionicons/icons';
import { CartActions } from './cart-actions';
import { CartService, maxFor } from './cart.service';
import { fileUrl } from './shop.service';
import { StoreItem, StoreShop, discountPercent } from './store.models';

/** One product in a grid: photo, price, and the add-to-cart control. */
@Component({
  selector: 'app-product-card',
  imports: [CurrencyPipe, RouterLink, IonIcon],
  template: `
    @let i = item();
    <article class="product" [class.unavailable]="soldOut()">
      <div class="photo">
        @if (image(); as src) { <img [src]="src" [alt]="i.name" loading="lazy" /> }
        @else { <ion-icon name="image-outline" aria-hidden="true" /> }
        @if (discount(); as percent) { <span class="deal">{{ percent }}% OFF</span> }
        @if (soldOut()) { <span class="sold-out">Out of stock</span> }
      </div>
      <div class="info">
        <h3>{{ i.name }}</h3>
        <p class="unit">{{ i.unit }}</p>
        @if (showShop()) {
          <a class="from" [routerLink]="['/store', shop().id]">{{ shop().name }}@if (!shop().isOpen) { · closed }</a>
        }
        @if (i.available !== null && i.available > 0 && i.available <= 5) { <p class="few">Only {{ i.available }} left</p> }
        <div class="buy">
          <div class="price">
            <strong>{{ i.price | currency: 'INR' : 'symbol' : '1.0-2' }}</strong>
            @if (discount()) { <s>{{ i.mrp | currency: 'INR' : 'symbol' : '1.0-2' }}</s> }
          </div>
          @if (soldOut() || !shop().isOpen) {
            <!-- nothing to add -->
          } @else if (quantity(); as q) {
            <div class="qty" role="group" [attr.aria-label]="'Quantity of ' + i.name">
              <button type="button" [attr.aria-label]="'Remove one ' + i.name" (click)="set(q - 1)"><ion-icon name="remove-outline" /></button>
              <span aria-live="polite">{{ q }}</span>
              <button type="button" [disabled]="q >= max()" [attr.aria-label]="'Add one more ' + i.name" (click)="set(q + 1)"><ion-icon name="add-outline" /></button>
            </div>
          } @else {
            <button type="button" class="add" [attr.aria-label]="'Add ' + i.name + ' to cart'" (click)="set(1)">ADD</button>
          }
        </div>
      </div>
    </article>
  `,
})
export class ProductCard {
  private readonly cart = inject(CartService);
  private readonly actions = inject(CartActions);

  readonly item = input.required<StoreItem>();
  readonly shop = input.required<StoreShop>();
  /** Show which shop sells it, for results that mix shops. */
  readonly showShop = input(false);

  protected readonly image = computed(() => fileUrl(this.item().imageUrl));
  protected readonly discount = computed(() => discountPercent(this.item()));
  protected readonly soldOut = computed(() => this.item().available === 0);
  protected readonly max = computed(() => maxFor(this.item().available));
  /** Counts only when the cart belongs to this card's shop. */
  protected readonly quantity = computed(() =>
    this.cart.cart()?.shop.id === this.shop().id ? this.cart.quantityOf(this.item().id) : 0,
  );

  constructor() {
    addIcons({ addOutline, imageOutline, removeOutline });
  }

  protected set(quantity: number): void {
    void this.actions.set(this.shop(), this.item(), quantity);
  }
}
