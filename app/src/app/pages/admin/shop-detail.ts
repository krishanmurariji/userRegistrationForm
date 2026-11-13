import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AlertController, IonBackButton, IonBadge, IonButton, IonButtons, IonContent, IonHeader, IonItem, IonLabel, IonList, IonSpinner, IonText, IonTitle, IonToolbar } from '@ionic/angular';
import { AdminService, AdminShopDetail } from '../../core/admin.service';
import { toApiError } from '../../core/api-error';

/** Everything the admin can see and do for one shop. */
@Component({
  selector: 'app-admin-shop-detail',
  imports: [CurrencyPipe, DatePipe, RouterLink, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonBadge, IonButton, IonList, IonItem, IonLabel, IonSpinner, IonText],
  template: `
    <ion-header>
      <ion-toolbar color="dark">
        <ion-buttons slot="start"><ion-back-button defaultHref="/admin" /></ion-buttons>
        <ion-title>Shop</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <main class="page-column">
        @if (error(); as message) {
          <ion-text color="danger" role="alert"><p>{{ message }}</p></ion-text>
        }
        @if (shop(); as s) {
          <h1>{{ s.name }}</h1>
          <div class="badges">
            @if (s.isActive) {
              <ion-badge color="success">Active</ion-badge>
              <ion-badge color="light">{{ s.isOpen ? 'Taking orders' : 'Closed by owner' }}</ion-badge>
            } @else {
              <ion-badge color="danger">Deactivated</ion-badge>
            }
          </div>
          @if (s.description) { <p>{{ s.description }}</p> }
          <dl class="facts">
            <dt>Owner</dt>
            <dd>
              @if (s.ownerId) { <a [routerLink]="['/admin/users', s.ownerId]">{{ s.ownerName }}</a> ({{ s.ownerEmail }}) } @else { None }
            </dd>
            <dt>Phone</dt><dd>{{ s.phone }}</dd>
            <dt>Address</dt><dd>{{ s.addressLine }}, {{ s.city }} {{ s.pincode }}</dd>
            <dt>UPI ID</dt><dd>{{ s.upiId ?? 'Not set (cash on delivery only)' }}</dd>
            <dt>Delivery fee</dt><dd>{{ s.deliveryFee | currency: 'INR' : 'symbol' : '1.0-2' }}</dd>
            <dt>Minimum order</dt><dd>{{ s.minimumOrder | currency: 'INR' : 'symbol' : '1.0-2' }}</dd>
            <dt>Opened</dt><dd>{{ s.createdAt | date: 'd MMM y' }}</dd>
          </dl>

          <div class="stats">
            <div class="stat"><span class="value">{{ s.itemCount }}</span><span class="label">Items</span></div>
            <div class="stat"><span class="value">{{ s.categoryCount }}</span><span class="label">Categories</span></div>
            <div class="stat"><span class="value">{{ s.orderCount }}</span><span class="label">Orders</span></div>
            <div class="stat"><span class="value">{{ s.openOrderCount }}</span><span class="label">Orders in progress</span></div>
            <div class="stat"><span class="value">{{ s.deliveredSales | currency: 'INR' : 'symbol' : '1.0-0' }}</span><span class="label">Delivered sales</span></div>
          </div>

          <ion-button expand="block" fill="outline" [color]="s.isActive ? 'danger' : 'success'" [disabled]="busy()" (click)="toggle(s)" class="ion-margin-top">
            {{ s.isActive ? 'Deactivate shop' : 'Activate shop' }}
          </ion-button>

          <h2 class="section-title">Recent activity</h2>
          @if (s.recentActivity.length === 0) { <p class="muted">Nothing recorded yet.</p> }
          <ion-list>
            @for (entry of s.recentActivity; track entry.id) {
              <ion-item>
                <ion-label>
                  <h2>{{ entry.summary }}</h2>
                  <p class="meta">{{ entry.at | date: 'd MMM y, h:mm a' }} · by {{ entry.actorEmail ?? 'unknown' }}</p>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        } @else if (!error()) {
          <div class="centered"><ion-spinner name="crescent" aria-label="Loading shop" /></div>
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
