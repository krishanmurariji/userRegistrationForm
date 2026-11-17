import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppIcon } from './icon';
import { fileUrl } from './shop.service';
import { StoreShop } from './store.models';

/** A shop as customers see it in a list: cover picture, logo, address and what it offers. */
@Component({
  selector: 'app-shop-card',
  imports: [RouterLink, AppIcon],
  template: `
    @let s = shop();
    <a class="card shop-card big" [routerLink]="['/store', s.id]" [class.closed]="!s.isOpen">
      <span class="cover">
        @if (file(s.coverUrl); as src) { <img [src]="src" alt="" loading="lazy" decoding="async" /> }
        @else { <app-icon name="storefront" weight="duotone" /> }
        <span class="state" [class.open]="s.isOpen">{{ s.isOpen ? 'Open' : 'Closed' }}</span>
      </span>
      <span class="logo">
        @if (file(s.logoUrl); as src) { <img [src]="src" alt="" loading="lazy" /> }
        @else { <app-icon name="storefront" weight="duotone" /> }
      </span>
      <span class="body">
        <strong>{{ s.name }}</strong>
        <small><app-icon name="map-pin" />{{ s.addressLine }}, {{ s.city }}</small>
        <span class="tags">
          <span class="tag"><app-icon name="moped" />{{ s.deliveryFee ? '₹' + s.deliveryFee + ' delivery' : 'Free delivery' }}</span>
          @if (s.minimumOrder) { <span class="tag">Min ₹{{ s.minimumOrder }}</span> }
          @if (s.acceptsUpi) { <span class="tag"><app-icon name="qr-code" />UPI</span> }
        </span>
      </span>
      <span class="go"><app-icon name="caret-right" /></span>
    </a>
  `,
  styles: `:host { display: block; min-width: 0; }`,
})
export class ShopCard {
  readonly shop = input.required<StoreShop>();
  protected readonly file = fileUrl;
}
