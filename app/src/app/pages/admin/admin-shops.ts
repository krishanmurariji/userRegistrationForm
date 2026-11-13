import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { AlertController, IonBadge, IonButton, IonItem, IonLabel, IonList, IonSearchbar, IonSegment, IonSegmentButton, IonSpinner, IonText } from '@ionic/angular';
import { AdminService, AdminShop } from '../../core/admin.service';
import { toApiError } from '../../core/api-error';
import { PagedList } from '../../core/paged-list';

type Filter = 'all' | 'active' | 'deactivated';

@Component({
  selector: 'app-admin-shops',
  imports: [DatePipe, IonSearchbar, IonSegment, IonSegmentButton, IonLabel, IonList, IonItem, IonBadge, IonButton, IonSpinner, IonText],
  template: `
    <ion-searchbar placeholder="Search by shop, city or owner email" [debounce]="300"
      (ionInput)="search.set($event.detail.value ?? ''); list.reload()" />
    <ion-segment [value]="filter()" (ionChange)="filter.set($any($event.detail.value)); list.reload()">
      <ion-segment-button value="all"><ion-label>All</ion-label></ion-segment-button>
      <ion-segment-button value="active"><ion-label>Active</ion-label></ion-segment-button>
      <ion-segment-button value="deactivated"><ion-label>Deactivated</ion-label></ion-segment-button>
    </ion-segment>

    @if (actionError(); as message) {
      <ion-text color="danger" role="alert"><p>{{ message }}</p></ion-text>
    }
    @if (list.error(); as message) {
      <ion-text color="danger" role="alert"><p>{{ message }}</p></ion-text>
    }

    <p class="count">{{ list.total() }} {{ list.total() === 1 ? 'shop' : 'shops' }}</p>
    <ion-list>
      @for (shop of list.items(); track shop.id) {
        <ion-item>
          <ion-label>
            <h2>{{ shop.name }}</h2>
            <p>{{ shop.city }} · {{ shop.phone }}</p>
            <p>Owner: {{ shop.ownerName ?? 'none' }} @if (shop.ownerEmail) { ({{ shop.ownerEmail }}) }</p>
            <p class="meta">
              {{ shop.itemCount }} {{ shop.itemCount === 1 ? 'item' : 'items' }} · opened {{ shop.createdAt | date: 'd MMM y' }}
            </p>
            <div class="badges">
              @if (shop.isActive) {
                <ion-badge color="success">Active</ion-badge>
                <ion-badge color="light">{{ shop.isOpen ? 'Taking orders' : 'Closed by owner' }}</ion-badge>
              } @else {
                <ion-badge color="danger">Deactivated</ion-badge>
              }
            </div>
          </ion-label>
          <ion-button slot="end" fill="outline" [color]="shop.isActive ? 'danger' : 'success'" [disabled]="busy() === shop.id"
            (click)="toggle(shop)">
            {{ shop.isActive ? 'Deactivate' : 'Activate' }}
          </ion-button>
        </ion-item>
      }
    </ion-list>

    @if (list.loading()) {
      <div class="centered"><ion-spinner name="crescent" aria-label="Loading shops" /></div>
    } @else if (list.items().length === 0 && !list.error()) {
      <p class="muted">No shops match.</p>
    } @else if (list.hasMore) {
      <ion-button expand="block" fill="clear" (click)="list.more()">Load more</ion-button>
    }
  `,
})
export class AdminShops {
  private readonly admin = inject(AdminService);
  private readonly alerts = inject(AlertController);

  protected readonly search = signal('');
  protected readonly filter = signal<Filter>('all');
  protected readonly actionError = signal('');
  protected readonly busy = signal<string | null>(null);
  protected readonly list = new PagedList<AdminShop>((skip, take) =>
    this.admin.shops({
      search: this.search(),
      active: this.filter() === 'all' ? null : this.filter() === 'active',
      skip,
      take,
    }),
  );

  constructor() {
    void this.list.reload();
  }

  protected async toggle(shop: AdminShop): Promise<void> {
    if (shop.isActive) {
      const alert = await this.alerts.create({
        header: `Deactivate ${shop.name}?`,
        message: 'Customers will no longer see this shop, and its owner will not be able to change it.',
        buttons: [{ text: 'Cancel', role: 'cancel' }, { text: 'Deactivate', role: 'destructive' }],
      });
      await alert.present();
      if ((await alert.onDidDismiss()).role !== 'destructive') return;
    }

    this.busy.set(shop.id);
    this.actionError.set('');
    try {
      await this.admin.setShopActive(shop.id, !shop.isActive);
      this.list.replace((s) => s.id === shop.id, { ...shop, isActive: !shop.isActive });
    } catch (e) {
      this.actionError.set(toApiError(e).message);
    } finally {
      this.busy.set(null);
    }
  }
}
