import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cart, cartOutline, home, homeOutline, person, personOutline, receipt, receiptOutline } from 'ionicons/icons';
import { CartService } from './cart.service';

type Tab = 'home' | 'orders' | 'cart' | 'account';

/** The customer's main navigation, fixed at the bottom of the screen. */
@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, IonIcon],
  template: `
    <nav class="bottom-nav" aria-label="Main">
      <a routerLink="/" [class.active]="active() === 'home'" [attr.aria-current]="active() === 'home' ? 'page' : null">
        <ion-icon [name]="active() === 'home' ? 'home' : 'home-outline'" aria-hidden="true" /><span>Home</span>
      </a>
      <a routerLink="/orders" [class.active]="active() === 'orders'" [attr.aria-current]="active() === 'orders' ? 'page' : null">
        <ion-icon [name]="active() === 'orders' ? 'receipt' : 'receipt-outline'" aria-hidden="true" /><span>Orders</span>
      </a>
      <a routerLink="/cart" [class.active]="active() === 'cart'" [attr.aria-current]="active() === 'cart' ? 'page' : null">
        <span class="icon">
          <ion-icon [name]="active() === 'cart' ? 'cart' : 'cart-outline'" aria-hidden="true" />
          @if (cart.count(); as count) { <span class="count">{{ count > 99 ? '99+' : count }}</span> }
        </span>
        <span>Cart</span>
      </a>
      <a routerLink="/account" [class.active]="active() === 'account'" [attr.aria-current]="active() === 'account' ? 'page' : null">
        <ion-icon [name]="active() === 'account' ? 'person' : 'person-outline'" aria-hidden="true" /><span>Account</span>
      </a>
    </nav>
  `,
})
export class BottomNav {
  protected readonly cart = inject(CartService);
  readonly active = input.required<Tab>();

  constructor() {
    addIcons({ cart, cartOutline, home, homeOutline, person, personOutline, receipt, receiptOutline });
  }
}
