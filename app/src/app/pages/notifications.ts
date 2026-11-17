import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';
import { toApiError } from '../core/api-error';
import { AppIcon } from '../core/icon';
import { SkeletonList } from '../core/skeletons';
import { AppNotification, NotificationService } from '../core/notification.service';

@Component({
  selector: 'app-notifications',
  imports: [DatePipe, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonButton, IonContent, AppIcon, SkeletonList],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/" text="" /></ion-buttons>
        <ion-title>Notifications</ion-title>
        @if (service.unread()) {
          <ion-buttons slot="end"><ion-button class="text-button" (click)="readAll()">Mark all read</ion-button></ion-buttons>
        }
      </ion-toolbar>
    </ion-header>
    <ion-content class="shop-bg">
      <main class="shop-column narrow">
        @if (error(); as message) {
          <div class="card"><p role="alert" class="error-text">{{ message }}</p><button type="button" class="link" (click)="load()">Try again</button></div>
        } @else if (loading()) {
          <app-skeleton-list [count]="4" />
        } @else if (items().length === 0) {
          <div class="card empty-card tall">
            <span class="empty-art"><app-icon name="bell" weight="duotone" /></span>
            <p><strong>No notifications yet</strong></p>
            <p>News about your orders will appear here.</p>
          </div>
        } @else {
          <ul class="notes">
            @for (n of items(); track n.id) {
              <li>
                <button type="button" class="card note" [class.unread]="!n.read" (click)="open(n)">
                  <span class="head-icon"><app-icon [name]="icon(n.title + ' ' + n.body)" weight="duotone" /></span>
                  <span class="what">
                    <strong>@if (!n.read) { <span class="dot" aria-label="Unread"></span> }{{ n.title }}</strong>
                    <span>{{ n.body }}</span>
                    <small>{{ n.createdAt | date: 'd MMM, h:mm a' }}</small>
                  </span>
                  @if (n.link) { <app-icon class="go" name="caret-right" /> }
                </button>
              </li>
            }
          </ul>
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

  /** An icon that fits what the notification is about, judged from its words. */
  protected icon(text: string): string {
    if (/cancel/i.test(text)) return 'x-circle';
    if (/payment|upi|paid/i.test(text)) return 'wallet';
    if (/on its way|out for delivery/i.test(text)) return 'moped';
    if (/delivered/i.test(text)) return 'house';
    if (/packed|stock/i.test(text)) return 'package';
    if (/accepted/i.test(text)) return 'seal-check';
    if (/order/i.test(text)) return 'receipt';
    return 'bell';
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
