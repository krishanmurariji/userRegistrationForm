import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppIcon } from './icon';
import { webSignInUnavailable } from './platform';

/** The frame around the sign-in pages: a brand panel beside the form on wide screens, the logo above it on phones. */
@Component({
  selector: 'app-auth-shell',
  imports: [RouterLink, AppIcon],
  template: `
    <div class="auth-shell">
      <aside class="auth-side" aria-hidden="true">
        <div class="auth-side-inner">
          <div class="auth-logo"><img src="brand/logo-mark.svg" alt="" width="52" height="52" /><span>Small Mart</span></div>
          <h2>Your neighbourhood shops, <em>delivered.</em></h2>
          <ul>
            <li><app-icon name="storefront" weight="duotone" />Order from the shops near you</li>
            <li><app-icon name="wallet" weight="duotone" />Pay cash on delivery or by UPI</li>
            <li><app-icon name="moped" weight="duotone" />Follow your order to your door</li>
          </ul>
        </div>
        <div class="auth-orb o1"></div>
        <div class="auth-orb o2"></div>
      </aside>
      <div class="auth-main">
        @if (!inApp) {
          <a class="auth-back" routerLink="/welcome"><app-icon name="arrow-left" />Back to home</a>
        }
        <div class="auth-logo small"><img src="brand/logo-mark.svg" alt="" width="44" height="44" /><span>Small Mart</span></div>
        <main class="auth-card"><ng-content /></main>
      </div>
    </div>
  `,
})
export class AuthShell {
  protected readonly inApp = webSignInUnavailable;
}
