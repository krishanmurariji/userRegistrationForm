import { Component, effect, inject, input, signal } from '@angular/core';
import { IonButton, IonSpinner, IonText } from '@ionic/angular';
import { AdminService, AdminStats } from '../../core/admin.service';
import { toApiError } from '../../core/api-error';

@Component({
  selector: 'app-admin-overview',
  imports: [IonSpinner, IonText, IonButton],
  template: `
    @if (error(); as message) {
      <ion-text color="danger" role="alert"><p>{{ message }}</p></ion-text>
      <ion-button fill="outline" (click)="load()">Try again</ion-button>
    } @else if (stats(); as s) {
      <h2 class="section-title">Users</h2>
      <div class="stats">
        <div class="stat"><span class="value">{{ s.totalUsers }}</span><span class="label">Total users</span></div>
        <div class="stat"><span class="value">{{ s.customers }}</span><span class="label">Customers</span></div>
        <div class="stat"><span class="value">{{ s.shopOwners }}</span><span class="label">Shop owners</span></div>
        <div class="stat"><span class="value">{{ s.newUsersLast7Days }}</span><span class="label">New in 7 days</span></div>
        <div class="stat" [class.alert]="s.suspendedUsers > 0"><span class="value">{{ s.suspendedUsers }}</span><span class="label">Suspended</span></div>
      </div>
      <h2 class="section-title">Shops</h2>
      <div class="stats">
        <div class="stat"><span class="value">{{ s.activeShops }}</span><span class="label">Active shops</span></div>
        <div class="stat" [class.alert]="s.deactivatedShops > 0"><span class="value">{{ s.deactivatedShops }}</span><span class="label">Deactivated shops</span></div>
        <div class="stat"><span class="value">{{ s.items }}</span><span class="label">Items listed</span></div>
      </div>
      <h2 class="section-title">Orders</h2>
      <div class="stats">
        <div class="stat"><span class="value">{{ s.orders }}</span><span class="label">Total orders</span></div>
        <div class="stat"><span class="value">{{ s.ordersLast24Hours }}</span><span class="label">Orders in 24 hours</span></div>
        <div class="stat"><span class="value">{{ s.paymentsAwaitingVerification }}</span><span class="label">UPI payments waiting</span></div>
      </div>
      <h2 class="section-title">Last 24 hours</h2>
      <div class="stats">
        <div class="stat"><span class="value">{{ s.signInsLast24Hours }}</span><span class="label">Sign-ins</span></div>
        <div class="stat" [class.alert]="s.failedSignInsLast24Hours > 0"><span class="value">{{ s.failedSignInsLast24Hours }}</span><span class="label">Failed sign-ins</span></div>
      </div>
    } @else {
      <div class="centered"><ion-spinner name="crescent" aria-label="Loading overview" /></div>
    }
  `,
})
export class AdminOverview {
  private readonly admin = inject(AdminService);

  /** Changes whenever the admin page is shown again. */
  readonly refresh = input(0);
  protected readonly stats = signal<AdminStats | null>(null);
  protected readonly error = signal('');

  constructor() {
    effect(() => {
      this.refresh();
      void this.load();
    });
  }

  protected async load(): Promise<void> {
    this.error.set('');
    try {
      this.stats.set(await this.admin.stats());
    } catch (e) {
      this.error.set(toApiError(e).message);
    }
  }
}
