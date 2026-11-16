import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartService } from './cart.service';
import { AppIcon } from './icon';

/** The bar above the bottom edge that appears as soon as the cart has something in it. */
@Component({
  selector: 'app-cart-bar',
  imports: [CurrencyPipe, RouterLink, AppIcon],
  template: `
    @if (cart.count(); as count) {
      <a routerLink="/cart" class="cart-bar" [attr.aria-label]="'View cart, ' + count + ' items'">
        <span class="left">
          <span class="bag"><app-icon name="shopping-bag" weight="fill" />@for (n of [count]; track n) { <b class="n">{{ n }}</b> }</span>
          <span>
            <strong>{{ cart.subtotal() | currency: 'INR' : 'symbol' : '1.0-2' }}</strong>
            <small>from {{ cart.cart()?.shop?.name }}</small>
          </span>
        </span>
        <span class="go">View cart <app-icon name="caret-right" /></span>
      </a>
    }
  `,
})
export class CartBar {
  protected readonly cart = inject(CartService);
}
