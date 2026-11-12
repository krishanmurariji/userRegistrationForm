import { Component, inject, signal } from '@angular/core';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonItem, IonLabel, IonList, IonNote, IonTitle, IonToolbar } from '@ionic/angular';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-account',
  imports: [IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonList, IonItem, IonLabel, IonNote, IonButton],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/" /></ion-buttons>
        <ion-title>Account</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      @if (auth.user(); as user) {
        <main class="page-column">
          <h1>{{ user.fullName }}</h1>
          <ion-list inset>
            <ion-item>
              <ion-label>Email</ion-label>
              <ion-note slot="end">{{ user.email }}</ion-note>
            </ion-item>
            <ion-item lines="none">
              <ion-label>Account type</ion-label>
              <ion-note slot="end">{{ user.roles.includes('PlatformAdmin') ? 'Platform admin' : 'Member' }}</ion-note>
            </ion-item>
          </ion-list>
          <ion-button expand="block" fill="outline" [disabled]="busy()" (click)="signOut()">Sign out</ion-button>
        </main>
      }
    </ion-content>
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
