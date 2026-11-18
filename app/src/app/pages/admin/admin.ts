import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonButtons, IonContent, IonHeader, IonToolbar } from '@ionic/angular';
import { AppIcon } from '../../core/icon';
import { NotificationBell } from '../../core/notification-bell';
import { AdminActivity } from './admin-activity';
import { AdminOverview } from './admin-overview';
import { AdminShops } from './admin-shops';
import { AdminUsers } from './admin-users';

type Tab = 'overview' | 'users' | 'shops' | 'activity';

const TABS: { value: Tab; label: string; icon: string }[] = [
  { value: 'overview', label: 'Overview', icon: 'chart-bar' },
  { value: 'users', label: 'Users', icon: 'users-three' },
  { value: 'shops', label: 'Shops', icon: 'storefront' },
  { value: 'activity', label: 'Activity', icon: 'pulse' },
];

/** The platform admin's home: overview numbers, users, shops and the activity log. */
@Component({
  selector: 'app-admin',
  imports: [RouterLink, AppIcon, NotificationBell, IonHeader, IonToolbar, IonButtons, IonButton, IonContent, AdminOverview, AdminUsers, AdminShops, AdminActivity],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar>
        <div class="greeting" slot="start">
          <img class="brand-mark" src="brand/logo-mark.svg" alt="Small Mart" />
          <span class="who">
            <small>Small Mart</small>
            <strong>Admin console</strong>
          </span>
        </div>
        <ion-buttons slot="end">
          <app-notification-bell />
          <ion-button routerLink="/account" aria-label="Account" class="bell-button">
            <span slot="icon-only" class="bell"><app-icon name="user" /></span>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar class="tabs-toolbar">
        <div class="owner-tabs admin-tabs" role="tablist" aria-label="Admin sections">
          @for (t of tabs; track t.value) {
            <button type="button" role="tab" [attr.aria-selected]="tab() === t.value" [class.on]="tab() === t.value" (click)="tab.set(t.value)">
              <app-icon [name]="t.icon" [weight]="tab() === t.value ? 'fill' : 'regular'" />{{ t.label }}
            </button>
          }
        </div>
      </ion-toolbar>
    </ion-header>
    <ion-content class="shop-bg">
      <main class="shop-column admin">
        @switch (tab()) {
          @case ('overview') { <app-admin-overview [refresh]="visits()" (open)="tab.set($event)" /> }
          @case ('users') { <app-admin-users [refresh]="visits()" /> }
          @case ('shops') { <app-admin-shops /> }
          @case ('activity') { <app-admin-activity /> }
        }
      </main>
    </ion-content>
  `,
})
export class AdminPage {
  protected readonly tabs = TABS;
  protected readonly tab = signal<Tab>('overview');
  /** Goes up each time the page is shown again, so the visible tab reloads (for example after adding an owner). */
  protected readonly visits = signal(0);

  ionViewWillEnter(): void {
    this.visits.update((n) => n + 1);
  }
}
