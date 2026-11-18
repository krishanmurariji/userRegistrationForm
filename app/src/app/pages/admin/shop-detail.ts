import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AlertController, IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';
import { AdminService, AdminShopDetail } from '../../core/admin.service';
import { toApiError } from '../../core/api-error';
import { AppIcon } from '../../core/icon';
import { SkeletonList } from '../../core/skeletons';
import { activityLook } from './admin-ui';

/** Everything the admin can see and do for one shop. */
@Component({
  selector: 'app-admin-shop-detail',
  imports: [CurrencyPipe, DatePipe, RouterLink, AppIcon, SkeletonList, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/admin" text="" /></ion-buttons>
        <ion-title>Shop</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="shop-bg">
      <main class="shop-column narrow admin">
        @if (error(); as message) {
          <div class="card"><p role="alert" class="error-text">{{ message }}</p></div>
        }
        @if (shop(); as s) {
          <section class="card admin-profile" [class.off]="!s.isActive">
            <span class="avatar big shop"><app-icon name="storefront" weight="duotone" /></span>
            <h1>{{ s.name }}</h1>
            @if (s.description) { <p class="email">{{ s.description }}</p> }
            <span class="flags">
              @if (s.isActive) {
                <span class="flag" data-color="success">Active</span>
                <span class="flag" [attr.data-color]="s.isOpen ? 'primary' : 'muted'">{{ s.isOpen ? 'Taking orders' : 'Closed by owner' }}</span>
              } @else {
                <span class="flag" data-color="danger">Deactivated</span>
              }
            </span>
          </section>

          <div class="owner-tiles admin-tiles">
            <div class="tile"><span class="tile-icon"><app-icon name="package" weight="duotone" /></span><b>{{ s.itemCount }}</b><span>Items</span></div>
            <div class="tile"><span class="tile-icon"><app-icon name="squares-four" weight="duotone" /></span><b>{{ s.categoryCount }}</b><span>Categories</span></div>
            <div class="tile"><span class="tile-icon"><app-icon name="receipt" weight="duotone" /></span><b>{{ s.orderCount }}</b><span>Orders</span></div>
            <div class="tile" [class.warn]="s.openOrderCount > 0"><span class="tile-icon"><app-icon name="clock" weight="duotone" /></span><b>{{ s.openOrderCount }}</b><span>In progress</span></div>
            <div class="tile wide"><span class="tile-icon"><app-icon name="currency-inr" weight="duotone" /></span><b>{{ s.deliveredSales | currency: 'INR' : 'symbol' : '1.0-0' }}</b><span>Delivered sales</span></div>
          </div>

          <section class="card">
            <h2><span class="head-icon"><app-icon name="identification-card" weight="duotone" /></span>Details</h2>
            <dl class="admin-facts">
              <div><dt><app-icon name="user" />Owner</dt>
                <dd>@if (s.ownerId) { <a [routerLink]="['/admin/users', s.ownerId]">{{ s.ownerName }}</a><small>{{ s.ownerEmail }}</small> } @else { None }</dd></div>
              <div><dt><app-icon name="phone" />Phone</dt><dd><a [href]="'tel:' + s.phone">{{ s.phone }}</a></dd></div>
              <div><dt><app-icon name="map-pin" />Address</dt><dd>{{ s.addressLine }}, {{ s.city }} {{ s.pincode }}</dd></div>
              <div><dt><app-icon name="qr-code" />UPI ID</dt><dd>{{ s.upiId ?? 'Not set (cash on delivery only)' }}</dd></div>
              <div><dt><app-icon name="moped" />Delivery fee</dt><dd>{{ s.deliveryFee | currency: 'INR' : 'symbol' : '1.0-2' }}</dd></div>
              <div><dt><app-icon name="shopping-bag" />Minimum order</dt><dd>{{ s.minimumOrder | currency: 'INR' : 'symbol' : '1.0-2' }}</dd></div>
              <div><dt><app-icon name="calendar-blank" />Opened</dt><dd>{{ s.createdAt | date: 'd MMM y' }}</dd></div>
            </dl>
          </section>

          <section class="card">
            <h2><span class="head-icon" [class.bad]="s.isActive" [class.ok]="!s.isActive"><app-icon name="power" weight="duotone" /></span>{{ s.isActive ? 'Deactivate this shop' : 'Activate this shop' }}</h2>
            <p class="muted">{{ s.isActive ? 'Customers stop seeing the shop, and the owner cannot change it or handle orders.' : 'Customers can see the shop again and the owner gets full control back.' }}</p>
            <ion-button expand="block" [fill]="s.isActive ? 'outline' : 'solid'" [color]="s.isActive ? 'danger' : 'primary'" [disabled]="busy()" (click)="toggle(s)">
              <app-icon slot="start" name="power" />{{ s.isActive ? 'Deactivate shop' : 'Activate shop' }}
            </ion-button>
          </section>

          <section class="card">
            <h2><span class="head-icon"><app-icon name="pulse" weight="duotone" /></span>Recent activity</h2>
            @if (s.recentActivity.length === 0) { <p class="muted">Nothing recorded yet.</p> }
            @else {
              <ol class="admin-timeline">
                @for (entry of s.recentActivity; track entry.id) {
                  @let look = lookOf(entry.action);
                  <li [attr.data-tone]="look.tone">
                    <span class="dot"><app-icon [name]="look.icon" weight="duotone" /></span>
                    <span class="what">
                      <strong>{{ entry.summary }}</strong>
                      <small class="meta">{{ entry.at | date: 'd MMM y, h:mm a' }} · by {{ entry.actorEmail ?? 'unknown' }}</small>
                    </span>
                  </li>
                }
              </ol>
            }
          </section>
        } @else if (!error()) {
          <app-skeleton-list [count]="3" />
        }
      </main>
    </ion-content>
  `,
})
export class AdminShopDetailPage {
  private readonly admin = inject(AdminService);
  private readonly alerts = inject(AlertController);
  private readonly shopId = inject(ActivatedRoute).snapshot.paramMap.get('shopId')!;

  protected readonly shop = signal<AdminShopDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly lookOf = activityLook;

  ionViewWillEnter(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.shop.set(await this.admin.shop(this.shopId));
    } catch (e) {
      this.error.set(toApiError(e).message);
    }
  }

  protected async toggle(shop: AdminShopDetail): Promise<void> {
    if (shop.isActive) {
      const alert = await this.alerts.create({
        header: `Deactivate ${shop.name}?`,
        message: 'Customers will no longer see this shop, and its owner will not be able to change it or handle orders.',
        buttons: [{ text: 'Cancel', role: 'cancel' }, { text: 'Deactivate', role: 'destructive' }],
      });
      await alert.present();
      if ((await alert.onDidDismiss()).role !== 'destructive') return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.admin.setShopActive(shop.id, !shop.isActive);
      await this.load();
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
