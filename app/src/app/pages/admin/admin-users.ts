import { DatePipe } from '@angular/common';
import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActionSheetController, AlertController, IonBadge, IonButton, IonIcon, IonItem, IonLabel, IonList, IonSearchbar, IonSegment, IonSegmentButton, IonSpinner, IonText } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, ellipsisVertical } from 'ionicons/icons';
import { AdminService, AdminUser } from '../../core/admin.service';
import { toApiError } from '../../core/api-error';
import { PagedList } from '../../core/paged-list';

type Filter = 'all' | 'Customer' | 'ShopOwner' | 'suspended';

@Component({
  selector: 'app-admin-users',
  imports: [DatePipe, RouterLink, IonSearchbar, IonSegment, IonSegmentButton, IonLabel, IonList, IonItem, IonBadge, IonButton, IonIcon, IonSpinner, IonText],
  template: `
    <ion-button routerLink="/admin/shop-owners/new" class="ion-margin-bottom">
      <ion-icon slot="start" name="add-outline" />Add shop owner
    </ion-button>
    <ion-button fill="outline" [disabled]="exporting()" (click)="exportCsv()" class="ion-margin-bottom">
      {{ exporting() ? 'Preparing…' : 'Export to Excel (CSV)' }}
    </ion-button>
    <ion-searchbar placeholder="Search by name or email" [debounce]="300"
      (ionInput)="search.set($event.detail.value ?? ''); list.reload()" />
    <ion-segment [value]="filter()" (ionChange)="filter.set($any($event.detail.value)); list.reload()" [scrollable]="true">
      <ion-segment-button value="all"><ion-label>All</ion-label></ion-segment-button>
      <ion-segment-button value="Customer"><ion-label>Customers</ion-label></ion-segment-button>
      <ion-segment-button value="ShopOwner"><ion-label>Shop owners</ion-label></ion-segment-button>
      <ion-segment-button value="suspended"><ion-label>Suspended</ion-label></ion-segment-button>
    </ion-segment>

    @if (actionError(); as message) {
      <ion-text color="danger" role="alert"><p>{{ message }}</p></ion-text>
    }
    @if (list.error(); as message) {
      <ion-text color="danger" role="alert"><p>{{ message }}</p></ion-text>
    }

    <p class="count">{{ list.total() }} {{ list.total() === 1 ? 'user' : 'users' }}</p>
    <ion-list>
      @for (user of list.items(); track user.id) {
        <ion-item>
          <ion-label>
            <h2><a [routerLink]="['/admin/users', user.id]">{{ user.fullName }}</a></h2>
            <p>{{ user.email }}</p>
            <p class="meta">
              Joined {{ user.createdAt | date: 'd MMM y' }}
              @if (user.shopCount) { · {{ user.shopCount }} {{ user.shopCount === 1 ? 'shop' : 'shops' }} }
            </p>
            <div class="badges">
              @if (user.roles.includes('PlatformAdmin')) { <ion-badge color="dark">Admin</ion-badge> }
              @if (user.roles.includes('ShopOwner')) { <ion-badge color="primary">Shop owner</ion-badge> }
              @if (user.roles.includes('Customer')) { <ion-badge color="light">Customer</ion-badge> }
              @if (user.suspended) { <ion-badge color="danger">Suspended</ion-badge> }
              @if (!user.emailConfirmed) { <ion-badge color="warning">Email not confirmed</ion-badge> }
            </div>
          </ion-label>
          @if (!user.roles.includes('PlatformAdmin')) {
            <ion-button slot="end" fill="clear" color="medium" [attr.aria-label]="'Actions for ' + user.email" (click)="actions(user)">
              <ion-icon slot="icon-only" name="ellipsis-vertical" />
            </ion-button>
          }
        </ion-item>
      }
    </ion-list>

    @if (list.loading()) {
      <div class="centered"><ion-spinner name="crescent" aria-label="Loading users" /></div>
    } @else if (list.items().length === 0 && !list.error()) {
      <p class="muted">No users match.</p>
    } @else if (list.hasMore) {
      <ion-button expand="block" fill="clear" (click)="list.more()">Load more</ion-button>
    }
  `,
})
export class AdminUsers {
  private readonly admin = inject(AdminService);
  private readonly sheets = inject(ActionSheetController);
  private readonly alerts = inject(AlertController);

  readonly refresh = input(0);
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
    addIcons({ addOutline, ellipsisVertical });
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
          ? { text: 'Remove shop owner role', handler: () => void this.run(user, () => this.admin.removeShopOwner(user.id)) }
          : { text: 'Make shop owner', handler: () => void this.run(user, () => this.admin.makeShopOwner(user.id)) },
        user.suspended
          ? { text: 'Reactivate account', handler: () => void this.run(user, () => this.admin.setSuspended(user.id, false)) }
          : { text: 'Suspend account', role: 'destructive', handler: () => void this.confirmSuspend(user) },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
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
