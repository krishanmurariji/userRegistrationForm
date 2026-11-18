import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AlertController, IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonInput, IonTitle, IonToolbar } from '@ionic/angular';
import { AdminService, AdminUserDetail } from '../../core/admin.service';
import { toApiError } from '../../core/api-error';
import { AppIcon } from '../../core/icon';
import { SkeletonList } from '../../core/skeletons';
import { activityLook, initials, kindColor, kindLabel, userKind } from './admin-ui';

const METHOD_NAMES: Record<string, string> = { password: 'Email and password', google: 'Google', microsoft: 'Microsoft' };

/** Everything the admin can see and do for one user. */
@Component({
  selector: 'app-admin-user-detail',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, AppIcon, SkeletonList, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonInput, IonButton],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/admin" text="" /></ion-buttons>
        <ion-title>User</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="shop-bg">
      <main class="shop-column narrow admin">
        @if (error(); as message) {
          <div class="card"><p role="alert" class="error-text">{{ message }}</p></div>
        }
        @if (notice(); as message) {
          <div class="card ok-card admin-notice" role="status"><app-icon name="check-circle" weight="duotone" /><span>{{ message }}</span></div>
        }
        @if (detail(); as d) {
          <section class="card admin-profile" [class.off]="d.user.suspended">
            <span class="avatar big" [attr.data-kind]="kind(d.user)">{{ initials(d.user.fullName) }}</span>
            <h1>{{ d.user.fullName }}</h1>
            <p class="email">{{ d.user.email }}</p>
            <span class="flags">
              <span class="flag" [attr.data-color]="kindColor(d.user)">{{ kindLabel(d.user) }}</span>
              @if (d.user.suspended) { <span class="flag" data-color="danger">Suspended</span> }
              @if (!d.user.emailConfirmed) { <span class="flag" data-color="warning">Email not confirmed</span> }
            </span>
          </section>

          <section class="card">
            <h2><span class="head-icon"><app-icon name="identification-card" weight="duotone" /></span>Account</h2>
            <dl class="admin-facts">
              <div><dt><app-icon name="calendar-blank" />Joined</dt><dd>{{ d.user.createdAt | date: 'd MMM y, h:mm a' }}</dd></div>
              <div><dt><app-icon name="key" />Signs in with</dt><dd>{{ methods() }}</dd></div>
              <div><dt><app-icon name="receipt" />Orders placed</dt><dd>{{ d.orderCount }}</dd></div>
            </dl>
          </section>

          @if (!isAdmin()) {
            <section class="card">
              <h2><span class="head-icon"><app-icon name="pen" weight="duotone" /></span>Edit details</h2>
              <form [formGroup]="form" (ngSubmit)="save()" novalidate class="stack">
                <ion-input formControlName="fullName" label="Full name" labelPlacement="stacked" fill="outline" errorText="Enter a name" />
                <ion-input formControlName="email" type="email" label="Email" labelPlacement="stacked" fill="outline"
                  helperText="Changing the email signs this user out on every device" errorText="Enter a valid email address" />
                <ion-button type="submit" [disabled]="busy() || form.pristine">Save changes<app-icon slot="end" name="check" /></ion-button>
              </form>
            </section>

            <section class="card">
              <h2><span class="head-icon"><app-icon name="gear" weight="duotone" /></span>Actions</h2>
              <div class="admin-actions">
                <button type="button" [disabled]="busy()" (click)="sendReset()">
                  <span class="act-icon"><app-icon name="envelope-simple" weight="duotone" /></span>
                  <span class="what"><strong>Send password reset link</strong><small>Emails a link that works for 24 hours</small></span>
                  <app-icon class="go" name="caret-right" />
                </button>
                <button type="button" [disabled]="busy()" (click)="changeType(!isOwner())">
                  <span class="act-icon"><app-icon name="user-switch" weight="duotone" /></span>
                  <span class="what"><strong>{{ isOwner() ? 'Change to customer' : 'Change to shop owner' }}</strong><small>Signs them out so they sign in again as the new type</small></span>
                  <app-icon class="go" name="caret-right" />
                </button>
                @if (d.user.suspended) {
                  <button type="button" class="ok" [disabled]="busy()" (click)="run(admin.setSuspended(d.user.id, false), 'Account reactivated.')">
                    <span class="act-icon"><app-icon name="check-circle" weight="duotone" /></span>
                    <span class="what"><strong>Reactivate account</strong><small>They can sign in again</small></span>
                    <app-icon class="go" name="caret-right" />
                  </button>
                } @else {
                  <button type="button" class="bad" [disabled]="busy()" (click)="suspend()">
                    <span class="act-icon"><app-icon name="prohibit" weight="duotone" /></span>
                    <span class="what"><strong>Suspend account</strong><small>Signs them out everywhere until reactivated</small></span>
                    <app-icon class="go" name="caret-right" />
                  </button>
                }
              </div>
            </section>
          }

          @if (d.shops.length) {
            <section class="card">
              <h2><span class="head-icon"><app-icon name="storefront" weight="duotone" /></span>Shops owned</h2>
              <ul class="owner-item-list single admin-list">
                @for (shop of d.shops; track shop.id) {
                  <li>
                    <a class="owner-item" [routerLink]="['/admin/shops', shop.id]">
                      <span class="avatar shop"><app-icon name="storefront" weight="duotone" /></span>
                      <span class="what"><strong>{{ shop.name }}</strong><small><app-icon name="map-pin" />{{ shop.city }}</small></span>
                      <span class="flag" [attr.data-color]="shop.isActive ? 'success' : 'danger'">{{ shop.isActive ? 'Active' : 'Deactivated' }}</span>
                      <app-icon class="go" name="caret-right" />
                    </a>
                  </li>
                }
              </ul>
            </section>
          }

          <section class="card">
            <h2><span class="head-icon"><app-icon name="pulse" weight="duotone" /></span>Recent activity</h2>
            @if (d.recentActivity.length === 0) { <p class="muted">Nothing recorded yet.</p> }
            @else {
              <ol class="admin-timeline">
                @for (entry of d.recentActivity; track entry.id) {
                  @let look = lookOf(entry.action);
                  <li [attr.data-tone]="look.tone">
                    <span class="dot"><app-icon [name]="look.icon" weight="duotone" /></span>
                    <span class="what">
                      <strong>{{ entry.summary }}</strong>
                      <small class="meta">{{ entry.at | date: 'd MMM y, h:mm a' }} · by {{ entry.actorEmail ?? 'unknown' }}</small>
                    </span>
                  </li>
                }
              </ol>
            }
          </section>
        } @else if (!error()) {
          <app-skeleton-list [count]="3" />
        }
      </main>
    </ion-content>

  `,
})
export class AdminUserDetailPage {
  protected readonly admin = inject(AdminService);
  private readonly alerts = inject(AlertController);
  private readonly userId = inject(ActivatedRoute).snapshot.paramMap.get('userId')!;

  protected readonly detail = signal<AdminUserDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly initials = initials;
  protected readonly kind = userKind;
  protected readonly kindLabel = kindLabel;
  protected readonly kindColor = kindColor;
  protected readonly lookOf = activityLook;
  protected readonly form = inject(FormBuilder).nonNullable.group({
    fullName: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(200)]],
    email: ['', [Validators.required, Validators.email]],
  });

  protected isAdmin(): boolean {
    return this.detail()?.user.roles.includes('PlatformAdmin') ?? false;
  }

  protected isOwner(): boolean {
    return this.detail()?.user.roles.includes('ShopOwner') ?? false;
  }

  protected methods(): string {
    const names = this.detail()?.signInMethods.map((m) => METHOD_NAMES[m] ?? m) ?? [];
    return names.length ? names.join(', ') : 'No password set yet (invited)';
  }

  ionViewWillEnter(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.show(await this.admin.user(this.userId));
    } catch (e) {
      this.error.set(toApiError(e).message);
    }
  }

  private show(detail: AdminUserDetail): void {
    this.detail.set(detail);
    this.form.reset({ fullName: detail.user.fullName, email: detail.user.email });
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    const { fullName, email } = this.form.getRawValue();
    await this.act(async () => this.show(await this.admin.updateUser(this.userId, fullName.trim(), email.trim())), 'Details saved.');
  }

  protected async sendReset(): Promise<void> {
    await this.act(() => this.admin.sendPasswordReset(this.userId), `A password reset link was emailed to ${this.detail()!.user.email}.`);
    await this.load();
  }

  /** An account is only one kind, so this swaps the type rather than adding to it. */
  protected async changeType(toOwner: boolean): Promise<void> {
    const alert = await this.alerts.create({
      header: toOwner ? 'Change to a shop owner?' : 'Change to a customer?',
      message: toOwner
        ? 'This user will stop being a customer and become a shop owner. They are signed out everywhere and sign in again as an owner.'
        : 'This user will stop being a shop owner and become a customer. They are signed out everywhere and sign in again as a customer.',
      buttons: [{ text: 'Cancel', role: 'cancel' }, { text: 'Change account', role: 'confirm' }],
    });
    await alert.present();
    if ((await alert.onDidDismiss()).role !== 'confirm') return;
    await this.run(
      toOwner ? this.admin.makeShopOwner(this.userId) : this.admin.removeShopOwner(this.userId),
      toOwner ? 'This account is now a shop owner account.' : 'This account is now a customer account.',
    );
  }

  protected async suspend(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Suspend this account?',
      message: 'The user will be signed out everywhere and cannot sign in until reactivated.',
      buttons: [{ text: 'Cancel', role: 'cancel' }, { text: 'Suspend', role: 'destructive' }],
    });
    await alert.present();
    if ((await alert.onDidDismiss()).role === 'destructive') await this.run(this.admin.setSuspended(this.userId, true), 'Account suspended.');
  }

  /** For actions that return the updated user row: reload the whole page of details afterwards. */
  protected async run(action: Promise<unknown>, done: string): Promise<void> {
    await this.act(() => action, done);
    await this.load();
  }

  private async act(action: () => Promise<unknown>, done: string): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await action();
      this.notice.set(done);
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
