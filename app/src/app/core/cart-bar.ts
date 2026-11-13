import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cart, chevronForward } from 'ionicons/icons';
import { CartService } from './cart.service';

/** The bar above the bottom edge that appears as soon as the cart has something in it. */
@Component({
  selector: 'app-cart-bar',
  imports: [CurrencyPipe, RouterLink, IonIcon],
  template: `
    @if (cart.count(); as count) {
      <a routerLink="/cart" class="cart-bar" [attr.aria-label]="'View cart, ' + count + ' items'">
        <span class="left">
          <ion-icon name="cart" aria-hidden="true" />
          <span>
            <strong>{{ count }} {{ count === 1 ? 'item' : 'items' }} · {{ cart.subtotal() | currency: 'INR' : 'symbol' : '1.0-2' }}</strong>
            <small>from {{ cart.cart()?.shop?.name }}</small>
          </span>
        </span>
        <span class="go">View cart <ion-icon name="chevron-forward" aria-hidden="true" /></span>
      </a>
    }
  `,
})
export class CartBar {
  protected readonly cart = inject(CartService);

  constructor() {
    addIcons({ cart, chevronForward });
  }
}
