import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonLabel, IonSegment, IonSegmentButton, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { personCircleOutline } from 'ionicons/icons';
import { NotificationBell } from '../../core/notification-bell';
import { AdminActivity } from './admin-activity';
import { AdminOverview } from './admin-overview';
import { AdminShops } from './admin-shops';
import { AdminUsers } from './admin-users';

type Tab = 'overview' | 'users' | 'shops' | 'activity';

/** The platform admin's home: overview numbers, users, shops and the activity log. */
@Component({
  selector: 'app-admin',
  imports: [RouterLink, NotificationBell, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonSegment, IonSegmentButton, IonLabel, IonContent, AdminOverview, AdminUsers, AdminShops, AdminActivity],
  template: `
    <ion-header>
      <ion-toolbar color="dark">
        <ion-title>Small Mart Admin</ion-title>
        <ion-buttons slot="end">
          <app-notification-bell />
          <ion-button routerLink="/account" aria-label="Account">
            <ion-icon slot="icon-only" name="person-circle-outline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="tab()" (ionChange)="tab.set($any($event.detail.value))" [scrollable]="true">
          <ion-segment-button value="overview"><ion-label>Overview</ion-label></ion-segment-button>
          <ion-segment-button value="users"><ion-label>Users</ion-label></ion-segment-button>
          <ion-segment-button value="shops"><ion-label>Shops</ion-label></ion-segment-button>
          <ion-segment-button value="activity"><ion-label>Activity</ion-label></ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <main class="page-column wide">
        @switch (tab()) {
          @case ('overview') { <app-admin-overview [refresh]="visits()" /> }
          @case ('users') { <app-admin-users [refresh]="visits()" /> }
          @case ('shops') { <app-admin-shops /> }
          @case ('activity') { <app-admin-activity /> }
        }
      </main>
    </ion-content>
  `,
})
export class AdminPage {
  protected readonly tab = signal<Tab>('overview');
  /** Goes up each time the page is shown again, so the visible tab reloads (for example after adding an owner). */
  protected readonly visits = signal(0);

  constructor() {
    addIcons({ personCircleOutline });
  }

  ionViewWillEnter(): void {
    this.visits.update((n) => n + 1);
  }
}
