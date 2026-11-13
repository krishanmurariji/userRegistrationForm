import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { IonButton, IonItem, IonLabel, IonList, IonSearchbar, IonSegment, IonSegmentButton, IonSpinner, IonText } from '@ionic/angular';
import { AdminService, AuditEntry } from '../../core/admin.service';
import { PagedList } from '../../core/paged-list';

@Component({
  selector: 'app-admin-activity',
  imports: [DatePipe, IonSearchbar, IonSegment, IonSegmentButton, IonLabel, IonList, IonItem, IonButton, IonSpinner, IonText],
  template: `
    <ion-searchbar placeholder="Search by email or description" [debounce]="300"
      (ionInput)="search.set($event.detail.value ?? ''); list.reload()" />
    <ion-segment [value]="action()" (ionChange)="action.set($any($event.detail.value)); list.reload()" [scrollable]="true">
      <ion-segment-button value=""><ion-label>All</ion-label></ion-segment-button>
      <ion-segment-button value="user.sign"><ion-label>Sign-ins</ion-label></ion-segment-button>
      <ion-segment-button value="user."><ion-label>Users</ion-label></ion-segment-button>
      <ion-segment-button value="shop."><ion-label>Shops</ion-label></ion-segment-button>
    </ion-segment>

    @if (list.error(); as message) {
      <ion-text color="danger" role="alert"><p>{{ message }}</p></ion-text>
    }

    <p class="count">{{ list.total() }} {{ list.total() === 1 ? 'entry' : 'entries' }}</p>
    <ion-list>
      @for (entry of list.items(); track entry.id) {
        <ion-item>
          <ion-label>
            <h2 [class.failed]="isFailure(entry)">{{ entry.summary }}</h2>
            <p>{{ entry.actorEmail ?? 'Unknown user' }}</p>
            <p class="meta">
              {{ entry.at | date: 'd MMM y, h:mm:ss a' }} · {{ entry.action }}
              @if (entry.ipAddress) { · {{ entry.ipAddress }} }
            </p>
          </ion-label>
        </ion-item>
      }
    </ion-list>

    @if (list.loading()) {
      <div class="centered"><ion-spinner name="crescent" aria-label="Loading activity" /></div>
    } @else if (list.items().length === 0 && !list.error()) {
      <p class="muted">No activity matches.</p>
    } @else if (list.hasMore) {
      <ion-button expand="block" fill="clear" (click)="list.more()">Load more</ion-button>
    }
  `,
})
export class AdminActivity {
  private readonly admin = inject(AdminService);

  protected readonly search = signal('');
  protected readonly action = signal('');
  protected readonly list = new PagedList<AuditEntry>((skip, take) =>
    this.admin.auditLogs({ search: this.search(), action: this.action(), skip, take }),
  );

  constructor() {
    void this.list.reload();
  }

  protected isFailure(entry: AuditEntry): boolean {
    return ['user.sign_in_failed', 'user.locked_out', 'user.suspended', 'shop.deactivated'].includes(entry.action);
  }
}
