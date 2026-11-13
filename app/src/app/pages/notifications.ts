import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonSpinner, IonText, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { notificationsOutline } from 'ionicons/icons';
import { toApiError } from '../core/api-error';
import { AppNotification, NotificationService } from '../core/notification.service';

@Component({
  selector: 'app-notifications',
  imports: [DatePipe, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonButton, IonContent, IonList, IonItem, IonLabel, IonIcon, IonSpinner, IonText],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/" /></ion-buttons>
        <ion-title>Notifications</ion-title>
        @if (service.unread()) {
          <ion-buttons slot="end"><ion-button (click)="readAll()">Mark all read</ion-button></ion-buttons>
        }
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <main class="page-column">
        @if (error(); as message) {
          <ion-text color="danger" role="alert"><p>{{ message }}</p></ion-text>
          <ion-button fill="outline" (click)="load()">Try again</ion-button>
        } @else if (loading()) {
          <div class="centered"><ion-spinner name="crescent" aria-label="Loading notifications" /></div>
        } @else if (items().length === 0) {
          <div class="empty">
            <ion-icon name="notifications-outline" aria-hidden="true" />
            <h2>No notifications yet</h2>
            <p>News about your orders will appear here.</p>
          </div>
        } @else {
          <ion-list>
            @for (n of items(); track n.id) {
              <ion-item [button]="true" [detail]="!!n.link" [class.unread]="!n.read" (click)="open(n)">
                <ion-label class="ion-text-wrap">
                  <h2>@if (!n.read) { <span class="dot" aria-label="Unread"></span> }{{ n.title }}</h2>
                  <p>{{ n.body }}</p>
                  <p class="meta">{{ n.createdAt | date: 'd MMM, h:mm a' }}</p>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        }
      </main>
    </ion-content>
  `,
})
export class NotificationsPage {
  protected readonly service = inject(NotificationService);
  private readonly router = inject(Router);

  protected readonly items = signal<AppNotification[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  constructor() {
    addIcons({ notificationsOutline });
  }

  ionViewWillEnter(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.error.set('');
    try {
      this.items.set(await this.service.list());
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected async open(notification: AppNotification): Promise<void> {
    if (!notification.read) {
      this.items.update((list) => list.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
      void this.service.markRead(notification.id).catch(() => undefined);
    }
    // Only in-app paths are followed.
    if (notification.link?.startsWith('/') && !notification.link.startsWith('//')) await this.router.navigateByUrl(notification.link);
  }

  protected async readAll(): Promise<void> {
    try {
      await this.service.markAllRead();
      this.items.update((list) => list.map((n) => ({ ...n, read: true })));
    } catch (e) {
      this.error.set(toApiError(e).message);
    }
  }
}
