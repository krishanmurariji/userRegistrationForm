import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBadge, IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { notificationsOutline } from 'ionicons/icons';
import { NotificationService } from './notification.service';

/** The bell in page headers, with the number of unread notifications. */
@Component({
  selector: 'app-notification-bell',
  imports: [RouterLink, IonButton, IonIcon, IonBadge],
  template: `
    <ion-button routerLink="/notifications" class="cart-button"
      [attr.aria-label]="notifications.unread() ? 'Notifications, ' + notifications.unread() + ' unread' : 'Notifications'">
      <ion-icon slot="icon-only" name="notifications-outline" />
      @if (notifications.unread(); as unread) { <ion-badge color="danger">{{ unread > 99 ? '99+' : unread }}</ion-badge> }
    </ion-button>
  `,
})
export class NotificationBell {
  protected readonly notifications = inject(NotificationService);

  constructor() {
    addIcons({ notificationsOutline });
  }
}
