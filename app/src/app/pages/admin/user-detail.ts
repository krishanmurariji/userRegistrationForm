import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AlertController, IonBackButton, IonBadge, IonButton, IonButtons, IonContent, IonHeader, IonInput, IonItem, IonLabel, IonList, IonSpinner, IonText, IonTitle, IonToolbar } from '@ionic/angular';
import { AdminService, AdminUserDetail } from '../../core/admin.service';
import { toApiError } from '../../core/api-error';

const METHOD_NAMES: Record<string, string> = { password: 'Email and password', google: 'Google', microsoft: 'Microsoft' };

/** Everything the admin can see and do for one user. */
@Component({
  selector: 'app-admin-user-detail',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonBadge, IonInput, IonButton, IonList, IonItem, IonLabel, IonSpinner, IonText],
  template: `
    <ion-header>
      <ion-toolbar color="dark">
        <ion-buttons slot="start"><ion-back-button defaultHref="/admin" /></ion-buttons>
        <ion-title>User</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <main class="page-column">
        @if (error(); as message) {
          <ion-text color="danger" role="alert"><p>{{ message }}</p></ion-text>
        }
        @if (notice(); as message) {
          <ion-text color="success" role="status"><p>{{ message }}</p></ion-text>
        }
        @if (detail(); as d) {
          <h1>{{ d.user.fullName }}</h1>
          <div class="badges">
            @if (isAdmin()) { <ion-badge color="dark">Admin</ion-badge> }
            @if (isOwner()) { <ion-badge color="primary">Shop owner</ion-badge> }
            @if (d.user.roles.includes('Customer')) { <ion-badge color="light">Customer</ion-badge> }
            @if (d.user.suspended) { <ion-badge color="danger">Suspended</ion-badge> }
            @if (!d.user.emailConfirmed) { <ion-badge color="warning">Email not confirmed</ion-badge> }
          </div>
          <dl class="facts">
            <dt>Email</dt><dd>{{ d.user.email }}</dd>
            <dt>Joined</dt><dd>{{ d.user.createdAt | date: 'd MMM y, h:mm a' }}</dd>
            <dt>Signs in with</dt><dd>{{ methods() }}</dd>
            <dt>Orders placed</dt><dd>{{ d.orderCount }}</dd>
          </dl>

          @if (!isAdmin()) {
            <h2 class="section-title">Edit details</h2>
            <form [formGroup]="form" (ngSubmit)="save()" novalidate class="stack">
              <ion-input formControlName="fullName" label="Full name" labelPlacement="stacked" fill="outline" errorText="Enter a name" />
              <ion-input formControlName="email" type="email" label="Email" labelPlacement="stacked" fill="outline"
                helperText="Changing the email signs this user out on every device" errorText="Enter a valid email address" />
              <ion-button type="submit" [disabled]="busy() || form.pristine">Save changes</ion-button>
            </form>

            <h2 class="section-title">Actions</h2>
            <div class="actions">
              <ion-button fill="outline" [disabled]="busy()" (click)="sendReset()">Send password reset link</ion-button>
              @if (isOwner()) {
                <ion-button fill="outline" [disabled]="busy()" (click)="run(admin.removeShopOwner(d.user.id), 'Shop owner role removed.')">Remove shop owner role</ion-button>
              } @else {
                <ion-button fill="outline" [disabled]="busy()" (click)="run(admin.makeShopOwner(d.user.id), 'This user is now a shop owner.')">Make shop owner</ion-button>
              }
              @if (d.user.suspended) {
                <ion-button fill="outline" color="success" [disabled]="busy()" (click)="run(admin.setSuspended(d.user.id, false), 'Account reactivated.')">Reactivate account</ion-button>
              } @else {
                <ion-button fill="outline" color="danger" [disabled]="busy()" (click)="suspend()">Suspend account</ion-button>
              }
            </div>
          }

          @if (d.shops.length) {
            <h2 class="section-title">Shops owned</h2>
            <ion-list>
              @for (shop of d.shops; track shop.id) {
                <ion-item [routerLink]="['/admin/shops', shop.id]" detail>
                  <ion-label><h2>{{ shop.name }}</h2><p>{{ shop.city }}</p></ion-label>
                  <ion-badge slot="end" [color]="shop.isActive ? 'success' : 'danger'">{{ shop.isActive ? 'Active' : 'Deactivated' }}</ion-badge>
                </ion-item>
              }
            </ion-list>
          }

          <h2 class="section-title">Recent activity</h2>
          @if (d.recentActivity.length === 0) { <p class="muted">Nothing recorded yet.</p> }
          <ion-list>
            @for (entry of d.recentActivity; track entry.id) {
              <ion-item>
                <ion-label>
                  <h2>{{ entry.summary }}</h2>
                  <p class="meta">{{ entry.at | date: 'd MMM y, h:mm a' }} · by {{ entry.actorEmail ?? 'unknown' }} · {{ entry.action }}</p>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        } @else if (!error()) {
          <div class="centered"><ion-spinner name="crescent" aria-label="Loading user" /></div>
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
