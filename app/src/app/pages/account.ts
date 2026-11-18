import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';
import { BottomNav } from '../core/bottom-nav';
import { AuthService } from '../core/auth.service';
import { AppIcon } from '../core/icon';
import { NotificationService } from '../core/notification.service';

@Component({
  selector: 'app-account',
  imports: [RouterLink, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonFooter, IonButton, BottomNav, AppIcon],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar>
        @if (!auth.isCustomer()) { <ion-buttons slot="start"><ion-back-button [defaultHref]="auth.isAdmin() ? '/admin' : '/my-shops'" text="" /></ion-buttons> }
        <ion-title>Account</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="shop-bg">
      @if (auth.user(); as user) {
        <main class="shop-column narrow account-page">
          <section class="profile">
            <span class="avatar" aria-hidden="true">{{ user.fullName.charAt(0).toUpperCase() }}</span>
            <div>
              <h1>{{ user.fullName }}</h1>
              <p>{{ user.email }}</p>
              <span class="tag">{{ auth.isAdmin() ? 'Platform admin' : auth.isShopOwner() ? 'Shop owner' : 'Customer' }}</span>
            </div>
          </section>
          @if (auth.isCustomer() || auth.isShopOwner()) {
            <nav class="card menu" aria-label="Account">
              @if (auth.isCustomer()) {
                <a routerLink="/orders"><span class="head-icon"><app-icon name="receipt" weight="duotone" /></span><span class="what">My orders<small>Track and reorder</small></span><app-icon class="go" name="caret-right" /></a>
              } @else {
                <a routerLink="/my-shops"><span class="head-icon"><app-icon name="storefront" weight="duotone" /></span><span class="what">My shops<small>Items, stock and orders</small></span><app-icon class="go" name="caret-right" /></a>
              }
              <a routerLink="/notifications">
                <span class="head-icon"><app-icon name="bell" weight="duotone" /></span>
                <span class="what">Notifications<small>{{ notifications.unread() ? notifications.unread() + ' unread' : 'You are all caught up' }}</small></span>
                @if (notifications.unread(); as unread) { <span class="pill">{{ unread > 99 ? '99+' : unread }}</span> }
                <app-icon class="go" name="caret-right" />
              </a>
            </nav>
          }
          <nav class="card menu" aria-label="Privacy">
            <a routerLink="/privacy"><span class="head-icon"><app-icon name="shield-check" weight="duotone" /></span><span class="what">Privacy policy<small>What we collect and why</small></span><app-icon class="go" name="caret-right" /></a>
            @if (!auth.isAdmin()) {
              <a routerLink="/delete-account" class="danger"><span class="head-icon bad"><app-icon name="trash" weight="duotone" /></span><span class="what">Delete account<small>Erase your account and personal details</small></span><app-icon class="go" name="caret-right" /></a>
            }
          </nav>
          <ion-button expand="block" fill="outline" class="sign-out" [disabled]="busy()" (click)="signOut()"><app-icon slot="start" name="sign-out" />Sign out</ion-button>
        </main>
      }
    </ion-content>
    @if (auth.isCustomer()) { <ion-footer class="shop-footer"><app-bottom-nav active="account" /></ion-footer> }
  `,
})
export class AccountPage {
  protected readonly auth = inject(AuthService);
  protected readonly notifications = inject(NotificationService);
  protected readonly busy = signal(false);

  protected async signOut(): Promise<void> {
    this.busy.set(true);
    await this.auth.logout();
  }
}
