import { CurrencyPipe } from '@angular/common';
import { Component, ElementRef, effect, inject, viewChild } from '@angular/core';
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
          <span class="bag"><app-icon name="shopping-bag" weight="fill" /><b #badge class="n">{{ count }}</b></span>
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
  private readonly badge = viewChild<ElementRef<HTMLElement>>('badge');

  constructor() {
    // The count badge gives a small bump whenever the number changes.
    effect(() => {
      this.cart.count();
      const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;
      this.badge()?.nativeElement.animate?.(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }],
        { duration: 280, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
      );
    });
  }
}
