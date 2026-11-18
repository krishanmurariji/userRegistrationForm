import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { AppIcon } from '../core/icon';

/** The public privacy policy. App stores link to it, so it works without signing in. */
@Component({
  selector: 'app-privacy',
  imports: [RouterLink, AppIcon, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button [defaultHref]="auth.isSignedIn() ? '/account' : '/welcome'" text="" /></ion-buttons>
        <ion-title>Privacy policy</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="shop-bg">
      <main class="shop-column narrow legal">
        <header class="legal-hero">
          <img src="brand/logo-mark.svg" alt="" width="56" height="56" />
          <h1>Small Mart privacy policy</h1>
          <p>Last updated {{ updated }}. This explains what Small Mart collects, why, who it is shared with, and how to delete it.</p>
        </header>

        <section class="card">
          <h2><span class="head-icon"><app-icon name="identification-card" weight="duotone" /></span>What we collect</h2>
          <ul>
            <li><strong>Your account:</strong> name, email address and a scrambled (hashed) password. If you sign in with Google or Microsoft we receive your name, email and an account ID from them, never your password.</li>
            <li><strong>Orders:</strong> the items you buy, the delivery name, phone number and address you type in, notes for the shop, and the order history.</li>
            <li><strong>UPI payments:</strong> the UPI transaction reference and, if you upload one, a screenshot of the payment, so the shop can check it. We never see or store your UPI PIN or bank details.</li>
            <li><strong>Shop owners:</strong> shop name, phone, address, UPI ID, logo, cover photo, items, prices and stock.</li>
            <li><strong>Camera and photos:</strong> only when you choose to take or pick a photo (a product photo, a shop logo, a payment screenshot). The app never uses the camera in the background.</li>
            <li><strong>Security records:</strong> sign-ins, failed sign-ins and important account changes, with the IP address, to protect accounts from misuse.</li>
          </ul>
          <p class="muted">We do not collect your location, contacts, or advertising ID, and the app contains no ads or third-party tracking.</p>
        </section>

        <section class="card">
          <h2><span class="head-icon"><app-icon name="gear" weight="duotone" /></span>How we use it</h2>
          <ul>
            <li>To run your account and keep it secure.</li>
            <li>To send your order to the shop and show you its progress. The shop sees your delivery name, phone and address so it can deliver.</li>
            <li>To send emails you need, such as confirming your address and resetting your password, and in-app notifications about your orders.</li>
            <li>For shop owners who use “scan products”: the photo is sent to an AI service to read the product name and price. Only the photo is sent.</li>
          </ul>
          <p class="muted">We do not sell your data or use it for advertising.</p>
        </section>

        <section class="card">
          <h2><span class="head-icon"><app-icon name="shield-check" weight="duotone" /></span>Who else handles it</h2>
          <p>Small Mart uses these services to run. Each only gets what it needs, and data is always sent over an encrypted (HTTPS) connection.</p>
          <ul>
            <li><strong>Hosting and database:</strong> MonsterASP.NET (the server) and Supabase (the database).</li>
            <li><strong>Email:</strong> Google (Gmail) sends our emails.</li>
            <li><strong>Sign-in:</strong> Google and Microsoft, only if you choose to sign in with them.</li>
            <li><strong>Notifications (shop owners on Android):</strong> Google Firebase Cloud Messaging delivers new-order alerts to the phone using a notification ID for that phone, which is removed when you sign out.</li>
            <li><strong>Product scanning (shop owners only):</strong> OpenAI reads product photos. Open Food Facts looks up barcodes.</li>
          </ul>
        </section>

        <section class="card">
          <h2><span class="head-icon"><app-icon name="clock" weight="duotone" /></span>How long we keep it</h2>
          <p>We keep your data while you have an account. When you delete it, your sign-in, name, email and saved details are erased straight away. Past orders stay with the shop for its accounts and tax records, but your name, phone, address and notes are removed from them. Security records are kept only as long as needed to protect the service.</p>
        </section>

        <section class="card">
          <h2><span class="head-icon bad"><app-icon name="prohibit" weight="duotone" /></span>Your choices</h2>
          <ul>
            <li>You can see and change your details in the app at any time.</li>
            <li>You can <a routerLink="/delete-account">delete your account</a> from the app (Account, then Delete account) or on our website.</li>
            <li>Small Mart is not meant for children under 13.</li>
          </ul>
        </section>

        <section class="card">
          <h2><span class="head-icon"><app-icon name="envelope-simple" weight="duotone" /></span>Contact</h2>
          @if (supportEmail) {
            <p>Questions about your data? Email <a [href]="'mailto:' + supportEmail">{{ supportEmail }}</a>.</p>
          } @else {
            <p>Questions about your data? Use the contact email shown on our app store page.</p>
          }
          <p class="muted">If this policy changes, we will update the date at the top and tell you in the app when the change matters.</p>
        </section>
      </main>
    </ion-content>
  `,
})
export class PrivacyPage {
  protected readonly auth = inject(AuthService);
  protected readonly supportEmail = environment.supportEmail;
  protected readonly updated = '18 November 2026';
}
