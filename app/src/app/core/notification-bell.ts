import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton } from '@ionic/angular';
import { AppIcon } from './icon';
import { NotificationService } from './notification.service';

/** The bell in page headers, with the number of unread notifications. */
@Component({
  selector: 'app-notification-bell',
  imports: [RouterLink, IonButton, AppIcon],
  template: `
    <ion-button routerLink="/notifications" class="bell-button"
      [attr.aria-label]="notifications.unread() ? 'Notifications, ' + notifications.unread() + ' unread' : 'Notifications'">
      <span slot="icon-only" class="bell">
        <app-icon name="bell" />
        @if (notifications.unread(); as unread) { <span class="count">{{ unread > 99 ? '99+' : unread }}</span> }
      </span>
    </ion-button>
  `,
})
export class NotificationBell {
  protected readonly notifications = inject(NotificationService);
}
