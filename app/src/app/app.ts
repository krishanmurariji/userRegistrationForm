import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { AuthService } from './core/auth.service';
import { SideRail } from './core/side-rail';

@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet, SideRail],
  template: `
    <ion-app [class.has-rail]="auth.isCustomer() || auth.isShopOwner()">
      @if (auth.isCustomer() || auth.isShopOwner()) { <app-side-rail [owner]="auth.isShopOwner()" /> }
      <ion-router-outlet />
    </ion-app>
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
}
