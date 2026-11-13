import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonText, IonThumbnail, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, cartOutline, imageOutline, removeOutline } from 'ionicons/icons';
import { toApiError } from '../core/api-error';
import { CartService, maxFor } from '../core/cart.service';
import { fileUrl } from '../core/shop.service';

@Component({
  selector: 'app-cart',
  imports: [CurrencyPipe, RouterLink, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonList, IonItem, IonLabel, IonThumbnail, IonIcon, IonButton, IonText],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/" /></ion-buttons>
        <ion-title>Cart</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <main class="page-column">
        @if (notice(); as message) {
          <div class="notice" role="status"><strong>Your cart was updated.</strong>{{ message }}</div>
        }
        @if (error(); as message) {
          <ion-text color="danger" role="alert"><p>{{ message }}</p></ion-text>
        }
        @if (cart.cart(); as c) {
          <h1>{{ c.shop.name }}</h1>
          <ion-list>
            @for (line of c.lines; track line.itemId) {
              <ion-item>
                <ion-thumbnail slot="start" class="thumb">
                  @if (image(line.imageUrl); as src) { <img [src]="src" alt="" /> }
                  @else { <ion-icon name="image-outline" aria-hidden="true" /> }
                </ion-thumbnail>
                <ion-label>
                  <h2>{{ line.name }}</h2>
                  <p>{{ line.unit }} · {{ line.price | currency: 'INR' : 'symbol' : '1.0-2' }}</p>
                  <p><strong>{{ line.price * line.quantity | currency: 'INR' : 'symbol' : '1.0-2' }}</strong></p>
                  @if (line.available !== null && line.quantity >= line.available) { <p class="meta">That is all the shop has left.</p> }
                </ion-label>
                <div slot="end" class="stepper">
                  <ion-button fill="outline" size="small" [attr.aria-label]="'Remove one ' + line.name" (click)="cart.changeLine(line.itemId, line.quantity - 1)">
                    <ion-icon slot="icon-only" name="remove-outline" />
                  </ion-button>
                  <span aria-live="polite">{{ line.quantity }}</span>
                  <ion-button fill="outline" size="small" [disabled]="line.quantity >= maxFor(line.available)" [attr.aria-label]="'Add one more ' + line.name" (click)="cart.changeLine(line.itemId, line.quantity + 1)">
                    <ion-icon slot="icon-only" name="add-outline" />
                  </ion-button>
                </div>
              </ion-item>
            }
          </ion-list>

          <table class="lines totals">
            <tfoot>
              <tr><td>Items total</td><td class="amount">{{ cart.subtotal() | currency: 'INR' : 'symbol' : '1.0-2' }}</td></tr>
              <tr><td>Delivery fee</td><td class="amount">{{ c.shop.deliveryFee | currency: 'INR' : 'symbol' : '1.0-2' }}</td></tr>
              <tr class="grand"><td>Total</td><td class="amount">{{ cart.total() | currency: 'INR' : 'symbol' : '1.0-2' }}</td></tr>
            </tfoot>
          </table>

          @if (!c.shop.isOpen) {
            <div class="notice" role="status"><strong>{{ c.shop.name }} is closed right now.</strong>You can order when it opens again.</div>
          } @else if (cart.belowMinimum()) {
            <div class="notice" role="status">
              <strong>Minimum order is ₹{{ c.shop.minimumOrder }}.</strong>
              Add items worth {{ c.shop.minimumOrder - cart.subtotal() | currency: 'INR' : 'symbol' : '1.0-2' }} more to order.
            </div>
          }
          <ion-button expand="block" routerLink="/checkout" [disabled]="!c.shop.isOpen || cart.belowMinimum()">Checkout</ion-button>
          <ion-button expand="block" fill="clear" [routerLink]="['/store', c.shop.id]">Add more items</ion-button>
        } @else {
          <div class="empty">
            <ion-icon name="cart-outline" aria-hidden="true" />
            <h2>Your cart is empty</h2>
            <p>Pick a shop and add some items.</p>
            <ion-button routerLink="/">Browse shops</ion-button>
          </div>
        }
      </main>
    </ion-content>
  `,
})
export class CartPage {
  protected readonly cart = inject(CartService);
  protected readonly maxFor = maxFor;
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly image = fileUrl;

  constructor() {
    addIcons({ addOutline, cartOutline, imageOutline, removeOutline });
  }

  /** Prices may have changed since the items were added, so check with the shop every time the cart opens. */
  async ionViewWillEnter(): Promise<void> {
    this.error.set('');
    try {
      this.notice.set(await this.cart.refresh());
    } catch (e) {
      this.error.set(toApiError(e).message);
    }
  }
}
