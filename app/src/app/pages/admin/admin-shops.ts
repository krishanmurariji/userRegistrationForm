import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AlertController, IonButton, IonSearchbar, IonSpinner } from '@ionic/angular';
import { AdminService, AdminShop } from '../../core/admin.service';
import { toApiError } from '../../core/api-error';
import { AppIcon } from '../../core/icon';
import { PagedList } from '../../core/paged-list';
import { SkeletonList } from '../../core/skeletons';

type Filter = 'all' | 'active' | 'deactivated';

@Component({
  selector: 'app-admin-shops',
  imports: [DatePipe, RouterLink, AppIcon, SkeletonList, IonSearchbar, IonButton, IonSpinner],
  template: `
    <div class="admin-bar">
      <ion-searchbar class="owner-search" placeholder="Search by shop, city or owner email" [debounce]="300"
        (ionInput)="search.set($event.detail.value ?? ''); list.reload()" />
      <div class="admin-buttons">
        <ion-button fill="outline" [disabled]="exporting()" (click)="exportCsv()">
          @if (exporting()) { <ion-spinner slot="start" name="crescent" aria-hidden="true" />Preparing… }
          @else { <app-icon slot="start" name="export" />Export CSV }
        </ion-button>
      </div>
    </div>
    <div class="pills" role="group" aria-label="Filter shops">
      <button type="button" [class.on]="filter() === 'all'" (click)="filter.set('all'); list.reload()"><app-icon name="storefront" weight="duotone" />All</button>
      <button type="button" [class.on]="filter() === 'active'" (click)="filter.set('active'); list.reload()"><app-icon name="check-circle" weight="duotone" />Active</button>
      <button type="button" class="warn" [class.on]="filter() === 'deactivated'" (click)="filter.set('deactivated'); list.reload()"><app-icon name="power" weight="duotone" />Deactivated</button>
    </div>

    @if (actionError(); as message) {
      <div class="card"><p role="alert" class="error-text">{{ message }}</p></div>
    }
    @if (list.error(); as message) {
      <div class="card"><p role="alert" class="error-text">{{ message }}</p></div>
    }

    <p class="admin-count">{{ list.total() }} {{ list.total() === 1 ? 'shop' : 'shops' }}</p>
    @if (list.items().length) {
      <ul class="owner-item-list admin-list">
        @for (shop of list.items(); track shop.id) {
          <li>
            <div class="owner-item admin-row" [class.off]="!shop.isActive">
              <a class="admin-row-link" [routerLink]="['/admin/shops', shop.id]">
                <span class="avatar shop"><app-icon name="storefront" weight="duotone" /></span>
                <span class="what">
                  <strong>{{ shop.name }}</strong>
                  <small><app-icon name="map-pin" />{{ shop.city }} · {{ shop.phone }}</small>
                  <small><app-icon name="user" />{{ shop.ownerName ?? 'No owner' }}</small>
                  <span class="flags">
                    @if (shop.isActive) {
                      <span class="flag" [attr.data-color]="shop.isOpen ? 'success' : 'muted'">{{ shop.isOpen ? 'Taking orders' : 'Closed by owner' }}</span>
                    } @else {
                      <span class="flag" data-color="danger">Deactivated</span>
                    }
                    <span class="meta"><app-icon name="package" />{{ shop.itemCount }} {{ shop.itemCount === 1 ? 'item' : 'items' }} · {{ shop.createdAt | date: 'MMM y' }}</span>
                  </span>
                </span>
              </a>
              <button type="button" class="admin-toggle" [class.on]="shop.isActive" [disabled]="busy() === shop.id"
                [attr.aria-label]="(shop.isActive ? 'Deactivate ' : 'Activate ') + shop.name" (click)="toggle(shop)">
                <app-icon name="power" />{{ shop.isActive ? 'Deactivate' : 'Activate' }}
              </button>
            </div>
          </li>
        }
      </ul>
    }

    @if (list.loading()) {
      <app-skeleton-list [count]="3" />
    } @else if (list.items().length === 0 && !list.error()) {
      <div class="card empty-card">
        <span class="empty-art small"><app-icon name="storefront" weight="duotone" /></span>
        <p><strong>No shops match</strong></p>
        <p>Try another name, city or filter.</p>
      </div>
    } @else if (list.hasMore) {
      <button type="button" class="admin-more" (click)="list.more()">Load more<app-icon name="caret-right" /></button>
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

  protected readonly exporting = signal(false);

  protected async exportCsv(): Promise<void> {
    this.exporting.set(true);
    try {
      await this.admin.export('shops');
    } catch (e) {
      this.list.error.set(toApiError(e).message);
    } finally {
      this.exporting.set(false);
    }
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
