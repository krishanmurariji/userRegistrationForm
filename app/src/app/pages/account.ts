import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';
import { BottomNav } from '../core/bottom-nav';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-account',
  imports: [RouterLink, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonFooter, IonButton, BottomNav],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar [color]="auth.isAdmin() ? 'dark' : 'primary'">
        @if (auth.isAdmin()) { <ion-buttons slot="start"><ion-back-button defaultHref="/admin" /></ion-buttons> }
        <ion-title>Account</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="shop-bg">
      @if (auth.user(); as user) {
        <main class="shop-column narrow">
          <section class="card profile">
            <span class="avatar" aria-hidden="true">{{ user.fullName.charAt(0).toUpperCase() }}</span>
            <div>
              <h1>{{ user.fullName }}</h1>
              <p>{{ user.email }}</p>
              <span class="tag open">{{ auth.isAdmin() ? 'Platform admin' : auth.isShopOwner() ? 'Shop owner' : 'Customer' }}</span>
            </div>
          </section>
          @if (!auth.isAdmin()) {
            <nav class="card menu" aria-label="Account">
              <a routerLink="/orders">My orders</a>
              <a routerLink="/notifications">Notifications</a>
              @if (auth.isShopOwner()) { <a routerLink="/my-shops">Manage my shops</a> }
            </nav>
          }
          <ion-button expand="block" fill="outline" [disabled]="busy()" (click)="signOut()">Sign out</ion-button>
        </main>
      }
    </ion-content>
    @if (!auth.isAdmin()) { <ion-footer class="shop-footer"><app-bottom-nav active="account" /></ion-footer> }
  `,
})
export class AccountPage {
  protected readonly auth = inject(AuthService);
  protected readonly busy = signal(false);

  protected async signOut(): Promise<void> {
    this.busy.set(true);
    await this.auth.logout();
  }
}
