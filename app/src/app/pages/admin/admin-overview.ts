import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { AdminService, AdminStats } from '../../core/admin.service';
import { toApiError } from '../../core/api-error';
import { AppIcon } from '../../core/icon';
import { SkeletonList } from '../../core/skeletons';

type Section = 'users' | 'shops' | 'activity';

interface Tile {
  icon: string;
  value: number;
  label: string;
  /** warn: worth a look when above zero. */
  warn?: boolean;
  open?: Section;
}

@Component({
  selector: 'app-admin-overview',
  imports: [AppIcon, SkeletonList],
  template: `
    @if (error(); as message) {
      <div class="card"><p role="alert" class="error-text">{{ message }}</p><button type="button" class="link" (click)="load()">Try again</button></div>
    } @else if (stats(); as s) {
      <section class="admin-hero">
        <span class="hero-icon"><app-icon [name]="attention() ? 'shield-warning' : 'shield-check'" weight="duotone" /></span>
        <span class="what">
          <small>Today on Small Mart</small>
          <strong>{{ s.ordersLast24Hours }} {{ s.ordersLast24Hours === 1 ? 'order' : 'orders' }} · {{ s.signInsLast24Hours }} sign-ins</strong>
          <span>
            @if (attention(); as n) { {{ n }} {{ n === 1 ? 'thing needs' : 'things need' }} a look below. }
            @else { Everything looks healthy. }
          </span>
        </span>
      </section>

      @for (group of groups(); track group.title) {
        <h2 class="admin-group"><app-icon [name]="group.icon" weight="duotone" />{{ group.title }}</h2>
        <div class="owner-tiles admin-tiles">
          @for (t of group.tiles; track t.label) {
            <button type="button" class="tile" [class.warn]="t.warn && t.value > 0" [disabled]="!t.open" (click)="t.open && open.emit(t.open)">
              <span class="tile-icon"><app-icon [name]="t.icon" weight="duotone" /></span>
              <b>{{ t.value }}</b>
              <span>{{ t.label }}</span>
            </button>
          }
        </div>
      }
    } @else {
      <app-skeleton-list [count]="3" />
    }
  `,
})
export class AdminOverview {
  private readonly admin = inject(AdminService);

  /** Changes whenever the admin page is shown again. */
  readonly refresh = input(0);
  /** Asks the admin page to show another tab. */
  readonly open = output<Section>();
  protected readonly stats = signal<AdminStats | null>(null);
  protected readonly error = signal('');

  protected readonly attention = computed(() => {
    const s = this.stats();
    if (!s) return 0;
    return [s.suspendedUsers, s.deactivatedShops, s.failedSignInsLast24Hours, s.paymentsAwaitingVerification].filter((n) => n > 0).length;
  });

  protected readonly groups = computed(() => {
    const s = this.stats();
    if (!s) return [];
    const groups: { title: string; icon: string; tiles: Tile[] }[] = [
      {
        title: 'Users',
        icon: 'users-three',
        tiles: [
          { icon: 'users-three', value: s.totalUsers, label: 'Total users', open: 'users' },
          { icon: 'user-circle', value: s.customers, label: 'Customers', open: 'users' },
          { icon: 'storefront', value: s.shopOwners, label: 'Shop owners', open: 'users' },
          { icon: 'user-plus', value: s.newUsersLast7Days, label: 'New in 7 days', open: 'users' },
          { icon: 'prohibit', value: s.suspendedUsers, label: 'Suspended', warn: true, open: 'users' },
        ],
      },
      {
        title: 'Shops',
        icon: 'storefront',
        tiles: [
          { icon: 'storefront', value: s.activeShops, label: 'Active shops', open: 'shops' },
          { icon: 'power', value: s.deactivatedShops, label: 'Deactivated', warn: true, open: 'shops' },
          { icon: 'package', value: s.items, label: 'Items listed' },
        ],
      },
      {
        title: 'Orders',
        icon: 'receipt',
        tiles: [
          { icon: 'receipt', value: s.orders, label: 'Total orders' },
          { icon: 'clock', value: s.ordersLast24Hours, label: 'In 24 hours' },
          { icon: 'qr-code', value: s.paymentsAwaitingVerification, label: 'UPI waiting', warn: true },
        ],
      },
      {
        title: 'Last 24 hours',
        icon: 'pulse',
        tiles: [
          { icon: 'sign-in', value: s.signInsLast24Hours, label: 'Sign-ins', open: 'activity' },
          { icon: 'warning', value: s.failedSignInsLast24Hours, label: 'Failed sign-ins', warn: true, open: 'activity' },
        ],
      },
    ];
    return groups;
  });

  constructor() {
    effect(() => {
      this.refresh();
      void this.load();
    });
  }

  protected async load(): Promise<void> {
    this.error.set('');
    try {
      this.stats.set(await this.admin.stats());
    } catch (e) {
      this.error.set(toApiError(e).message);
    }
  }
}
