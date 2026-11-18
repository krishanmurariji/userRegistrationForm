import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { IonButton, IonSearchbar, IonSpinner } from '@ionic/angular';
import { AdminService, AuditEntry } from '../../core/admin.service';
import { toApiError } from '../../core/api-error';
import { AppIcon } from '../../core/icon';
import { PagedList } from '../../core/paged-list';
import { SkeletonList } from '../../core/skeletons';
import { activityLook } from './admin-ui';

const FILTERS = [
  { value: '', label: 'All', icon: 'pulse' },
  { value: 'user.sign', label: 'Sign-ins', icon: 'sign-in' },
  { value: 'user.', label: 'Users', icon: 'users-three' },
  { value: 'shop.', label: 'Shops', icon: 'storefront' },
];

@Component({
  selector: 'app-admin-activity',
  imports: [DatePipe, AppIcon, SkeletonList, IonSearchbar, IonButton, IonSpinner],
  template: `
    <div class="admin-bar">
      <ion-searchbar class="owner-search" placeholder="Search by email or description" [debounce]="300"
        (ionInput)="search.set($event.detail.value ?? ''); list.reload()" />
      <div class="admin-buttons">
        <ion-button fill="outline" [disabled]="exporting()" (click)="exportCsv()">
          @if (exporting()) { <ion-spinner slot="start" name="crescent" aria-hidden="true" />Preparing… }
          @else { <app-icon slot="start" name="export" />Export CSV }
        </ion-button>
      </div>
    </div>
    <div class="pills" role="group" aria-label="Filter activity">
      @for (f of filters; track f.value) {
        <button type="button" [class.on]="action() === f.value" (click)="action.set(f.value); list.reload()"><app-icon [name]="f.icon" weight="duotone" />{{ f.label }}</button>
      }
    </div>

    @if (list.error(); as message) {
      <div class="card"><p role="alert" class="error-text">{{ message }}</p></div>
    }

    <p class="admin-count">{{ list.total() }} {{ list.total() === 1 ? 'entry' : 'entries' }}</p>
    @if (list.items().length) {
      <ol class="card admin-timeline">
        @for (entry of list.items(); track entry.id) {
          @let look = lookOf(entry.action);
          <li [attr.data-tone]="look.tone">
            <span class="dot"><app-icon [name]="look.icon" weight="duotone" /></span>
            <span class="what">
              <strong [class.failed]="isFailure(entry)">{{ entry.summary }}</strong>
              <small>{{ entry.actorEmail ?? 'Unknown user' }}</small>
              <small class="meta">
                {{ entry.at | date: 'd MMM y, h:mm a' }} · <code>{{ entry.action }}</code>
                @if (entry.ipAddress) { · {{ entry.ipAddress }} }
              </small>
            </span>
          </li>
        }
      </ol>
    }

    @if (list.loading()) {
      <app-skeleton-list [count]="3" />
    } @else if (list.items().length === 0 && !list.error()) {
      <div class="card empty-card">
        <span class="empty-art small"><app-icon name="pulse" weight="duotone" /></span>
        <p><strong>No activity matches</strong></p>
        <p>Try another search or filter.</p>
      </div>
    } @else if (list.hasMore) {
      <button type="button" class="admin-more" (click)="list.more()">Load more<app-icon name="caret-right" /></button>
    }
  `,
})
export class AdminActivity {
  private readonly admin = inject(AdminService);

  protected readonly filters = FILTERS;
  protected readonly lookOf = activityLook;
  protected readonly search = signal('');
  protected readonly action = signal('');
  protected readonly list = new PagedList<AuditEntry>((skip, take) =>
    this.admin.auditLogs({ search: this.search(), action: this.action(), skip, take }),
  );

  constructor() {
    void this.list.reload();
  }

  protected readonly exporting = signal(false);

  protected async exportCsv(): Promise<void> {
    this.exporting.set(true);
    try {
      await this.admin.export('audit-logs');
    } catch (e) {
      this.list.error.set(toApiError(e).message);
    } finally {
      this.exporting.set(false);
    }
  }

  protected isFailure(entry: AuditEntry): boolean {
    return ['user.sign_in_failed', 'user.locked_out', 'user.suspended', 'shop.deactivated'].includes(entry.action);
  }
}
