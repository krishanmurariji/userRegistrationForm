import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBadge, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonSpinner, IonText, IonThumbnail, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, personCircleOutline, storefrontOutline } from 'ionicons/icons';
import { toApiError } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { Shop } from '../core/shop.models';
import { ShopService, fileUrl } from '../core/shop.service';

/** Landing page: shop owners see their shops, customers a welcome until shop browsing is built. */
@Component({
  selector: 'app-home',
  imports: [RouterLink, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonList, IonItem, IonLabel, IonThumbnail, IonBadge, IonSpinner, IonText],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>{{ auth.isShopOwner() ? 'My shops' : 'Small Mart' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button routerLink="/account" aria-label="Account">
            <ion-icon slot="icon-only" name="person-circle-outline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <main class="page-column">
        @if (!auth.isShopOwner()) {
          <div class="empty">
            <ion-icon name="storefront-outline" aria-hidden="true" />
            <h2>Welcome, {{ auth.user()?.fullName }}</h2>
            <p>Browsing shops and ordering is coming soon.</p>
          </div>
        } @else if (loading()) {
          <div class="centered"><ion-spinner name="crescent" aria-label="Loading shops" /></div>
        } @else if (error(); as message) {
          <ion-text color="danger" role="alert"><p>{{ message }}</p></ion-text>
          <ion-button fill="outline" (click)="load()">Try again</ion-button>
        } @else if (shops().length === 0) {
          <div class="empty">
            <ion-icon name="storefront-outline" aria-hidden="true" />
            <h2>Open your first shop</h2>
            <p>Add your shop, list your items and start taking orders.</p>
            <ion-button routerLink="/shops/new">Open a shop</ion-button>
          </div>
        } @else {
          <ion-list>
            @for (shop of shops(); track shop.id) {
              <ion-item [routerLink]="['/shops', shop.id]" detail>
                <ion-thumbnail slot="start" class="thumb">
                  @if (logo(shop); as src) { <img [src]="src" alt="" /> }
                  @else { <ion-icon name="storefront-outline" aria-hidden="true" /> }
                </ion-thumbnail>
                <ion-label>
                  <h2>{{ shop.name }}</h2>
                  <p>{{ shop.addressLine }}, {{ shop.city }}</p>
                </ion-label>
                @if (!shop.isActive) {
                  <ion-badge slot="end" color="danger">Deactivated</ion-badge>
                } @else {
                  <ion-badge slot="end" [color]="shop.isOpen ? 'success' : 'medium'">{{ shop.isOpen ? 'Open' : 'Closed' }}</ion-badge>
                }
              </ion-item>
            }
          </ion-list>
          <ion-button expand="block" fill="outline" routerLink="/shops/new" class="ion-margin-top">
            <ion-icon slot="start" name="add-outline" />Open another shop
          </ion-button>
        }
      </main>
    </ion-content>
  `,
})
export class HomePage {
  private readonly shopService = inject(ShopService);
  protected readonly auth = inject(AuthService);

  protected readonly shops = signal<Shop[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly logo = (shop: Shop) => fileUrl(shop.logoUrl);

  constructor() {
    addIcons({ addOutline, personCircleOutline, storefrontOutline });
  }

  /** Ionic keeps pages alive in the background, so reload every time this page is shown. */
  ionViewWillEnter(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    if (!this.auth.isShopOwner()) return;
    this.error.set('');
    try {
      this.shops.set(await this.shopService.myShops());
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.loading.set(false);
    }
  }
}
