import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartService } from './cart.service';
import { AppIcon } from './icon';

type Tab = 'home' | 'orders' | 'cart' | 'account';

/** The customer's main navigation, fixed at the bottom of the screen. */
@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, AppIcon],
  template: `
    <nav class="bottom-nav" aria-label="Main">
      <a routerLink="/" [class.active]="active() === 'home'" [attr.aria-current]="active() === 'home' ? 'page' : null">
        <span class="icon"><app-icon name="house" [weight]="active() === 'home' ? 'fill' : 'regular'" /></span><span class="label">Home</span>
      </a>
      <a routerLink="/orders" [class.active]="active() === 'orders'" [attr.aria-current]="active() === 'orders' ? 'page' : null">
        <span class="icon"><app-icon name="receipt" [weight]="active() === 'orders' ? 'fill' : 'regular'" /></span><span class="label">Orders</span>
      </a>
      <a routerLink="/cart" [class.active]="active() === 'cart'" [attr.aria-current]="active() === 'cart' ? 'page' : null">
        <span class="icon"><app-icon name="shopping-cart" [weight]="active() === 'cart' ? 'fill' : 'regular'" />@if (cart.count(); as count) { <span class="count">{{ count > 99 ? '99+' : count }}</span> }</span><span class="label">Cart</span>
      </a>
      <a routerLink="/account" [class.active]="active() === 'account'" [attr.aria-current]="active() === 'account' ? 'page' : null">
        <span class="icon"><app-icon name="user" [weight]="active() === 'account' ? 'fill' : 'regular'" /></span><span class="label">Account</span>
      </a>
    </nav>
  `,
})
export class BottomNav {
  protected readonly cart = inject(CartService);
  readonly active = input.required<Tab>();
}
