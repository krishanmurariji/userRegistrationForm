import { Component, inject, signal } from '@angular/core';
import { IonButton, IonContent, IonHeader, IonItem, IonLabel, IonList, IonNote, IonTitle, IonToolbar } from '@ionic/angular';
import { AuthService } from '../core/auth.service';

/** Placeholder landing page for signed-in users. Shops and items arrive in phase 2. */
@Component({
  selector: 'app-home',
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonNote, IonButton],
  template: `
    <ion-header>
      <ion-toolbar color="primary"><ion-title>Small Mart</ion-title></ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      @if (auth.user(); as user) {
        <main class="auth-card">
          <h1>Hello, {{ user.fullName }}</h1>
          <p class="lead">You are signed in. Shops and items are coming next.</p>
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
export class HomePage {
  protected readonly auth = inject(AuthService);
  protected readonly busy = signal(false);

  protected async signOut(): Promise<void> {
    this.busy.set(true);
    await this.auth.logout();
  }
}
