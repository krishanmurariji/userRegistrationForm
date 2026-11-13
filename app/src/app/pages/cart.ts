import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, cartOutline, imageOutline, removeOutline, trashOutline } from 'ionicons/icons';
import { toApiError } from '../core/api-error';
import { BottomNav } from '../core/bottom-nav';
import { CartService, maxFor } from '../core/cart.service';
import { fileUrl } from '../core/shop.service';

@Component({
  selector: 'app-cart',
  imports: [CurrencyPipe, RouterLink, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonIcon, IonButton, IonFooter, BottomNav],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/" /></ion-buttons>
        <ion-title>Cart</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="shop-bg">
      <main class="shop-column narrow">
        @if (notice(); as message) {
          <div class="card closed-note" role="status"><strong>Your cart was updated.</strong> {{ message }}</div>
        }
        @if (error(); as message) {
          <div class="card"><p role="alert" class="error-text">{{ message }}</p></div>
        }
        @if (cart.cart(); as c) {
          <section class="card">
            <header class="card-head">
              <h2>{{ c.shop.name }}</h2>
              <a [routerLink]="['/store', c.shop.id]">Add more items</a>
            </header>
            <ul class="cart-lines">
              @for (line of c.lines; track line.itemId) {
                <li>
                  <span class="thumb">
                    @if (image(line.imageUrl); as src) { <img [src]="src" alt="" /> } @else { <ion-icon name="image-outline" aria-hidden="true" /> }
                  </span>
                  <span class="what">
                    <strong>{{ line.name }}</strong>
                    <small>{{ line.unit }} · {{ line.price | currency: 'INR' : 'symbol' : '1.0-2' }}</small>
                    @if (line.available !== null && line.quantity >= line.available) { <small class="few">That is all the shop has left.</small> }
                  </span>
                  <span class="qty" role="group" [attr.aria-label]="'Quantity of ' + line.name">
                    <button type="button" [attr.aria-label]="(line.quantity === 1 ? 'Remove ' : 'Remove one ') + line.name" (click)="cart.changeLine(line.itemId, line.quantity - 1)">
                      <ion-icon [name]="line.quantity === 1 ? 'trash-outline' : 'remove-outline'" />
                    </button>
                    <span aria-live="polite">{{ line.quantity }}</span>
                    <button type="button" [disabled]="line.quantity >= maxFor(line.available)" [attr.aria-label]="'Add one more ' + line.name" (click)="cart.changeLine(line.itemId, line.quantity + 1)">
                      <ion-icon name="add-outline" />
                    </button>
                  </span>
                  <strong class="line-total">{{ line.price * line.quantity | currency: 'INR' : 'symbol' : '1.0-2' }}</strong>
                </li>
              }
            </ul>
          </section>

          <section class="card bill">
            <h2>Bill details</h2>
            <dl>
              <dt>Items total</dt><dd>{{ cart.subtotal() | currency: 'INR' : 'symbol' : '1.0-2' }}</dd>
              <dt>Delivery fee</dt><dd>{{ c.shop.deliveryFee ? (c.shop.deliveryFee | currency: 'INR' : 'symbol' : '1.0-2') : 'Free' }}</dd>
              <dt class="grand">To pay</dt><dd class="grand">{{ cart.total() | currency: 'INR' : 'symbol' : '1.0-2' }}</dd>
            </dl>
            @if (cart.savings(); as saved) { <p class="saving">You save {{ saved | currency: 'INR' : 'symbol' : '1.0-2' }} on this order</p> }
          </section>

          @if (!c.shop.isOpen) {
            <div class="card closed-note" role="status"><strong>{{ c.shop.name }} is closed right now.</strong> You can order when it opens again.</div>
          } @else if (cart.belowMinimum()) {
            <div class="card closed-note" role="status">
              <strong>Minimum order is ₹{{ c.shop.minimumOrder }}.</strong>
              Add items worth {{ c.shop.minimumOrder - cart.subtotal() | currency: 'INR' : 'symbol' : '1.0-2' }} more to order.
            </div>
          }
        } @else {
          <div class="card empty-card tall">
            <ion-icon name="cart-outline" aria-hidden="true" />
            <p><strong>Your cart is empty</strong></p>
            <p>Pick a shop and add some items.</p>
            <ion-button routerLink="/">Browse shops</ion-button>
          </div>
        }
      </main>
    </ion-content>

    <ion-footer class="shop-footer">
      @if (cart.cart(); as c) {
        <div class="pay-bar">
          <span><small>To pay</small><strong>{{ cart.total() | currency: 'INR' : 'symbol' : '1.0-2' }}</strong></span>
          <ion-button routerLink="/checkout" [disabled]="!c.shop.isOpen || cart.belowMinimum()">Checkout</ion-button>
        </div>
      } @else {
        <app-bottom-nav active="cart" />
      }
    </ion-footer>
  `,
})
export class CartPage {
  protected readonly cart = inject(CartService);
  protected readonly maxFor = maxFor;
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly image = fileUrl;

  constructor() {
    addIcons({ addOutline, cartOutline, imageOutline, removeOutline, trashOutline });
  }

  /** Prices and stock may have changed since the items were added, so check with the shop every time the cart opens. */
  async ionViewWillEnter(): Promise<void> {
    this.error.set('');
    try {
      this.notice.set(await this.cart.refresh());
    } catch (e) {
      this.error.set(toApiError(e).message);
    }
  }
}
