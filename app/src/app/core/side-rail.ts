import { Component, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AppIcon } from './icon';
import { CartService } from './cart.service';
import { NotificationService } from './notification.service';

/** The customer's navigation on wide screens: a rail down the left side instead of tabs at the bottom. */
@Component({
  selector: 'app-side-rail',
  imports: [RouterLink, RouterLinkActive, AppIcon],
  template: `
    <nav class="side-rail" aria-label="Main">
      <a [routerLink]="owner() ? '/my-shops' : '/'" class="rail-brand" aria-label="Small Mart home"><img src="brand/logo-mark.svg" alt="" /></a>
      @if (owner()) {
        <a routerLink="/my-shops" routerLinkActive="active" #shopsLink="routerLinkActive">
          <span class="icon"><app-icon name="storefront" [weight]="shopsLink.isActive ? 'fill' : 'regular'" /></span><span class="label">My shops</span>
        </a>
      } @else {
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" #home="routerLinkActive">
          <span class="icon"><app-icon name="house" [weight]="home.isActive ? 'fill' : 'regular'" /></span><span class="label">Home</span>
        </a>
        <a routerLink="/orders" routerLinkActive="active" #orders="routerLinkActive">
          <span class="icon"><app-icon name="receipt" [weight]="orders.isActive ? 'fill' : 'regular'" /></span><span class="label">Orders</span>
        </a>
        <a routerLink="/cart" routerLinkActive="active" #cartLink="routerLinkActive">
          <span class="icon">
            <app-icon name="shopping-cart" [weight]="cartLink.isActive ? 'fill' : 'regular'" />
            @if (cart.count(); as count) { <span class="count">{{ count > 99 ? '99+' : count }}</span> }
          </span>
          <span class="label">Cart</span>
        </a>
      }
      <a routerLink="/notifications" routerLinkActive="active" #alerts="routerLinkActive">
        <span class="icon">
          <app-icon name="bell" [weight]="alerts.isActive ? 'fill' : 'regular'" />
          @if (notifications.unread(); as unread) { <span class="count">{{ unread > 99 ? '99+' : unread }}</span> }
        </span>
        <span class="label">Alerts</span>
      </a>
      <a routerLink="/account" routerLinkActive="active" class="last" #account="routerLinkActive">
        <span class="icon"><app-icon name="user" [weight]="account.isActive ? 'fill' : 'regular'" /></span><span class="label">Account</span>
      </a>
    </nav>
  `,
})
export class SideRail {
  protected readonly cart = inject(CartService);
  protected readonly notifications = inject(NotificationService);
  /** Shop owners see their shops instead of the customer's home, orders and cart. */
  readonly owner = input(false);
}
