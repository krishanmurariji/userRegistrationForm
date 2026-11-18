import { DatePipe } from '@angular/common';
import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActionSheetController, AlertController, IonButton, IonSearchbar, IonSpinner } from '@ionic/angular';
import { AdminService, AdminUser } from '../../core/admin.service';
import { toApiError } from '../../core/api-error';
import { AppIcon } from '../../core/icon';
import { PagedList } from '../../core/paged-list';
import { SkeletonList } from '../../core/skeletons';
import { initials, kindColor, kindLabel, userKind } from './admin-ui';

type Filter = 'all' | 'Customer' | 'ShopOwner' | 'suspended';

const FILTERS: { value: Filter; label: string; icon: string }[] = [
  { value: 'all', label: 'All', icon: 'users-three' },
  { value: 'Customer', label: 'Customers', icon: 'user-circle' },
  { value: 'ShopOwner', label: 'Shop owners', icon: 'storefront' },
  { value: 'suspended', label: 'Suspended', icon: 'prohibit' },
];

@Component({
  selector: 'app-admin-users',
  imports: [DatePipe, RouterLink, AppIcon, SkeletonList, IonSearchbar, IonButton, IonSpinner],
  template: `
    <div class="admin-bar">
      <ion-searchbar class="owner-search" placeholder="Search by name or email" [debounce]="300"
        (ionInput)="search.set($event.detail.value ?? ''); list.reload()" />
      <div class="admin-buttons">
        <ion-button routerLink="/admin/shop-owners/new"><app-icon slot="start" name="user-plus" />Add shop owner</ion-button>
        <ion-button fill="outline" [disabled]="exporting()" (click)="exportCsv()">
          @if (exporting()) { <ion-spinner slot="start" name="crescent" aria-hidden="true" />Preparing… }
          @else { <app-icon slot="start" name="export" />Export CSV }
        </ion-button>
      </div>
    </div>
    <div class="pills" role="group" aria-label="Filter users">
      @for (f of filters; track f.value) {
        <button type="button" [class.on]="filter() === f.value" [class.warn]="f.value === 'suspended'" (click)="filter.set(f.value); list.reload()">
          <app-icon [name]="f.icon" weight="duotone" />{{ f.label }}
        </button>
      }
    </div>

    @if (actionError(); as message) {
      <div class="card"><p role="alert" class="error-text">{{ message }}</p></div>
    }
    @if (list.error(); as message) {
      <div class="card"><p role="alert" class="error-text">{{ message }}</p></div>
    }

    <p class="admin-count">{{ list.total() }} {{ list.total() === 1 ? 'user' : 'users' }}</p>
    @if (list.items().length) {
      <ul class="owner-item-list admin-list">
        @for (user of list.items(); track user.id) {
          <li>
            <div class="owner-item admin-row" [class.off]="user.suspended">
              <a class="admin-row-link" [routerLink]="['/admin/users', user.id]">
                <span class="avatar" [attr.data-kind]="kind(user)">{{ initials(user.fullName) }}</span>
                <span class="what">
                  <strong>{{ user.fullName }}</strong>
                  <small>{{ user.email }}</small>
                  <span class="flags">
                    <span class="flag" [attr.data-color]="kindColor(user)">{{ kindLabel(user) }}</span>
                    @if (user.suspended) { <span class="flag" data-color="danger">Suspended</span> }
                    @if (!user.emailConfirmed) { <span class="flag" data-color="warning">Email not confirmed</span> }
                    <span class="meta"><app-icon name="calendar-blank" />{{ user.createdAt | date: 'd MMM y' }}
                      @if (user.shopCount) { · {{ user.shopCount }} {{ user.shopCount === 1 ? 'shop' : 'shops' }} }</span>
                  </span>
                </span>
              </a>
              @if (!user.roles.includes('PlatformAdmin')) {
                <button type="button" class="round-btn" [attr.aria-label]="'Actions for ' + user.email" (click)="actions(user)">
                  <app-icon name="dots-three-vertical" />
                </button>
              }
            </div>
          </li>
        }
      </ul>
    }

    @if (list.loading()) {
      <app-skeleton-list [count]="3" />
    } @else if (list.items().length === 0 && !list.error()) {
      <div class="card empty-card">
        <span class="empty-art small"><app-icon name="users-three" weight="duotone" /></span>
        <p><strong>No users match</strong></p>
        <p>Try another name, email or filter.</p>
      </div>
    } @else if (list.hasMore) {
      <button type="button" class="admin-more" (click)="list.more()">Load more<app-icon name="caret-right" /></button>
    }
  `,
})
export class AdminUsers {
  private readonly admin = inject(AdminService);
  private readonly sheets = inject(ActionSheetController);
  private readonly alerts = inject(AlertController);

  readonly refresh = input(0);
  protected readonly filters = FILTERS;
  protected readonly initials = initials;
  protected readonly kind = userKind;
  protected readonly kindLabel = kindLabel;
  protected readonly kindColor = kindColor;
  protected readonly search = signal('');
  protected readonly filter = signal<Filter>('all');
  protected readonly actionError = signal('');
  protected readonly list = new PagedList<AdminUser>((skip, take) => {
    const filter = this.filter();
    return this.admin.users({
      search: this.search(),
      role: filter === 'Customer' || filter === 'ShopOwner' ? filter : null,
      suspended: filter === 'suspended' ? true : null,
      skip,
      take,
    });
  });

  constructor() {
    effect(() => {
      this.refresh();
      void this.list.reload();
    });
  }

  protected readonly exporting = signal(false);

  protected async exportCsv(): Promise<void> {
    this.exporting.set(true);
    try {
      await this.admin.export('users');
    } catch (e) {
      this.list.error.set(toApiError(e).message);
    } finally {
      this.exporting.set(false);
    }
  }

  protected async actions(user: AdminUser): Promise<void> {
    const isOwner = user.roles.includes('ShopOwner');
    const sheet = await this.sheets.create({
      header: user.email,
      buttons: [
        isOwner
          ? { text: 'Change to customer', handler: () => void this.confirmChange(user, false) }
          : { text: 'Change to shop owner', handler: () => void this.confirmChange(user, true) },
        user.suspended
          ? { text: 'Reactivate account', handler: () => void this.run(user, () => this.admin.setSuspended(user.id, false)) }
          : { text: 'Suspend account', role: 'destructive', handler: () => void this.confirmSuspend(user) },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  /** An account is only one kind, so this swaps the type rather than adding to it. */
  private async confirmChange(user: AdminUser, toOwner: boolean): Promise<void> {
    const alert = await this.alerts.create({
      header: toOwner ? 'Change to a shop owner?' : 'Change to a customer?',
      message: toOwner
        ? `${user.email} will stop being a customer and become a shop owner. They are signed out everywhere and sign in again as an owner.`
        : `${user.email} will stop being a shop owner and become a customer. They are signed out everywhere and sign in again as a customer.`,
      buttons: [{ text: 'Cancel', role: 'cancel' }, { text: 'Change account', role: 'confirm' }],
    });
    await alert.present();
    if ((await alert.onDidDismiss()).role !== 'confirm') return;
    await this.run(user, () => (toOwner ? this.admin.makeShopOwner(user.id) : this.admin.removeShopOwner(user.id)));
  }

  private async confirmSuspend(user: AdminUser): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Suspend this account?',
      message: `${user.email} will be signed out everywhere and cannot sign in until reactivated.`,
      buttons: [{ text: 'Cancel', role: 'cancel' }, { text: 'Suspend', role: 'destructive' }],
    });
    await alert.present();
    if ((await alert.onDidDismiss()).role === 'destructive') await this.run(user, () => this.admin.setSuspended(user.id, true));
  }

  private async run(user: AdminUser, change: () => Promise<AdminUser>): Promise<void> {
    this.actionError.set('');
    try {
      const updated = await change();
      this.list.replace((u) => u.id === user.id, updated);
    } catch (e) {
      this.actionError.set(toApiError(e).message);
    }
  }
}
