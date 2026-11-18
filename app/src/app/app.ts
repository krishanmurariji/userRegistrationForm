import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { AuthService } from './core/auth.service';
import { OrderAlert } from './core/order-alert';
import { PushService } from './core/push';
import { SideRail } from './core/side-rail';

@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet, SideRail, OrderAlert],
  template: `
    <ion-app [class.has-rail]="auth.isCustomer() || auth.isShopOwner()">
      @if (auth.isCustomer() || auth.isShopOwner()) { <app-side-rail [owner]="auth.isShopOwner()" /> }
      <ion-router-outlet />
      @if (auth.isShopOwner()) { <app-order-alert /> }
    </ion-app>
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
  /** Started here so phone notifications are set up as soon as a shop owner signs in. */
  private readonly push = inject(PushService);
}
