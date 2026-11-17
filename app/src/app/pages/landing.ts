import { Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { AppIcon } from '../core/icon';

interface Feature {
  icon: string;
  title: string;
  text: string;
}

/**
 * The public front page of the website: what Small Mart is, what it does for customers and for shop owners,
 * where to get the apps, and the way in to sign in. The Android, iOS and Windows apps open the sign-in page instead.
 */
@Component({
  selector: 'app-landing',
  imports: [RouterLink, IonContent, AppIcon],
  template: `
    <ion-content class="lp-content" [scrollEvents]="true" (ionScroll)="onScroll($event.detail.scrollTop)">
      <div #page class="lp" [class.still]="still" (pointermove)="tilt($event)" (pointerleave)="tilt(null)">
        <header class="lp-nav" [class.solid]="scrolled()">
          <a class="lp-brand" routerLink="/welcome" aria-label="Small Mart home">
            <img src="brand/logo-mark.svg" alt="" width="36" height="36" />
            <span>Small Mart</span>
          </a>
          <nav class="lp-links" aria-label="Sections">
            <a href="#features" (click)="go($event, 'features')">Features</a>
            <a href="#shops" (click)="go($event, 'shops')">For shops</a>
            <a href="#how" (click)="go($event, 'how')">How it works</a>
            <a href="#download" (click)="go($event, 'download')">Download</a>
          </nav>
          <div class="lp-actions">
            @if (auth.isSignedIn()) {
              <a routerLink="/" class="lp-btn">Open Small Mart</a>
            } @else {
              <a routerLink="/login" class="lp-btn ghost">Sign in</a>
              <a routerLink="/register" class="lp-btn">Get started</a>
            }
          </div>
        </header>

        <!-- Hero -->
        <section class="lp-hero">
          <div class="lp-blob b1" aria-hidden="true"></div>
          <div class="lp-blob b2" aria-hidden="true"></div>
          <div class="lp-hero-text">
            <span class="lp-eyebrow"><app-icon name="map-pin" weight="duotone" />Your local shops, now online</span>
            <h1>Neighbourhood shopping,<br /><em>delivered to your door.</em></h1>
            <p class="lp-lead">
              Order groceries and daily needs from the shops you already trust. Pay cash on delivery or by UPI,
              and follow your order until it reaches you.
            </p>
            <div class="lp-cta">
              <a routerLink="/register" class="lp-btn big">Start shopping <app-icon name="arrow-right" /></a>
              <a href="#download" class="lp-btn ghost big" (click)="go($event, 'download')">Get the app</a>
            </div>
            <ul class="lp-proof">
              <li><app-icon name="money" weight="duotone" />Cash on delivery</li>
              <li><app-icon name="qr-code" weight="duotone" />UPI payments</li>
              <li><app-icon name="moped" weight="duotone" />Live order tracking</li>
            </ul>
          </div>

          <div class="lp-stage" aria-hidden="true">
            <div class="lp-phones">
              <figure class="lp-phone back"><img src="landing/screen-store.webp" alt="" /></figure>
              <figure class="lp-phone front"><img src="landing/screen-home.webp" alt="" /></figure>
            </div>
            <div class="lp-float f1"><span class="dot ok"><app-icon name="check" /></span><span><strong>Order placed</strong><small>Sharma General Store</small></span></div>
            <div class="lp-float f2"><span class="dot"><app-icon name="moped" weight="duotone" /></span><span><strong>On the way</strong><small>Arriving in 20 min</small></span></div>
            <div class="lp-float f3"><span class="dot"><app-icon name="qr-code" weight="duotone" /></span><span><strong>UPI payment</strong><small>Confirmed by the shop</small></span></div>
          </div>
        </section>

        <section class="lp-band" aria-label="Highlights">
          <span><app-icon name="storefront" weight="duotone" />Real local shops</span>
          <span><app-icon name="tag" weight="duotone" />Shop prices and MRP shown</span>
          <span><app-icon name="bell" weight="duotone" />Updates at every step</span>
          <span><app-icon name="shield-check" weight="duotone" />Secure sign-in</span>
        </section>

        <!-- Features -->
        <section id="features" class="lp-section">
          <div class="lp-head reveal">
            <span class="lp-kicker">For customers</span>
            <h2>Everything you need for the daily shop</h2>
            <p>Simple enough for everyone in the family, quick enough for a busy morning.</p>
          </div>
          <div class="lp-grid">
            @for (f of customerFeatures; track f.title; let i = $index) {
              <article class="lp-card reveal" [style.--i]="i">
                <span class="lp-icon"><app-icon [name]="f.icon" weight="duotone" /></span>
                <h3>{{ f.title }}</h3>
                <p>{{ f.text }}</p>
              </article>
            }
          </div>
        </section>

        <!-- For shop owners -->
        <section id="shops" class="lp-section lp-split">
          <div class="lp-split-text reveal">
            <span class="lp-kicker">For shop owners</span>
            <h2>Take your shop online in an afternoon</h2>
            <p>List your items, take orders and get paid, all from your phone. No website to build, no tech skills needed.</p>
            <ul class="lp-checks">
              @for (f of ownerFeatures; track f.title) {
                <li><span class="lp-icon small"><app-icon [name]="f.icon" weight="duotone" /></span><span><strong>{{ f.title }}</strong>{{ f.text }}</span></li>
              }
            </ul>
          </div>
          <div class="lp-split-art reveal" aria-hidden="true">
            <div class="lp-tilt">
              <figure class="lp-phone flat"><img src="landing/screen-order.webp" alt="" /></figure>
              <div class="lp-float f4"><span class="dot warn"><app-icon name="package" weight="duotone" /></span><span><strong>Low stock</strong><small>Amul Butter: 4 left</small></span></div>
              <div class="lp-float f5"><span class="dot"><app-icon name="sparkle" weight="duotone" /></span><span><strong>Added from a photo</strong><small>Name, size and MRP filled in</small></span></div>
            </div>
          </div>
        </section>

        <!-- How it works -->
        <section id="how" class="lp-section">
          <div class="lp-head reveal">
            <span class="lp-kicker">How it works</span>
            <h2>From your phone to your door in three steps</h2>
          </div>
          <ol class="lp-steps">
            @for (s of steps; track s.title; let i = $index) {
              <li class="reveal" [style.--i]="i">
                <span class="lp-step-no">{{ i + 1 }}</span>
                <span class="lp-icon"><app-icon [name]="s.icon" weight="duotone" /></span>
                <h3>{{ s.title }}</h3>
                <p>{{ s.text }}</p>
              </li>
            }
          </ol>
        </section>

        <!-- Download -->
        <section id="download" class="lp-section">
          <div class="lp-head reveal">
            <span class="lp-kicker">Get Small Mart</span>
            <h2>On your phone, your computer or the web</h2>
            <p>One account works everywhere. Sign up once and use whichever you like.</p>
          </div>
          <div class="lp-downloads">
            <a class="lp-dl reveal" [href]="downloads + '/SmallMart-Android.apk'" style="--i: 0">
              <span class="lp-icon"><app-icon name="device-mobile" weight="duotone" /></span>
              <strong>Android</strong><small>Download the app (APK)</small>
            </a>
            <a class="lp-dl reveal" [href]="downloads + '/SmallMart-iPhone-unsigned.ipa'" style="--i: 1">
              <span class="lp-icon"><app-icon name="device-mobile-camera" weight="duotone" /></span>
              <strong>iPhone</strong><small>Test build, installs with Sideloadly or AltStore</small>
            </a>
            <a class="lp-dl reveal" [href]="downloads + '/SmallMart-Windows-Setup.exe'" style="--i: 2">
              <span class="lp-icon"><app-icon name="desktop" weight="duotone" /></span>
              <strong>Windows</strong><small>Download the installer</small>
            </a>
            <a class="lp-dl reveal" routerLink="/register" style="--i: 3">
              <span class="lp-icon"><app-icon name="globe" weight="duotone" /></span>
              <strong>Web</strong><small>Use it right here in your browser</small>
            </a>
          </div>
        </section>

        <section class="lp-final reveal">
          <img src="brand/logo-mark.svg" alt="" width="72" height="72" />
          <h2>Ready when you are</h2>
          <p>Create a free account and order from shops near you today.</p>
          <div class="lp-cta center">
            <a routerLink="/register" class="lp-btn big light">Create an account</a>
            <a routerLink="/login" class="lp-btn ghost big light">Sign in</a>
          </div>
        </section>

        <footer class="lp-footer">
          <div class="lp-brand"><img src="brand/logo-mark.svg" alt="" width="28" height="28" /><span>Small Mart</span></div>
          <nav aria-label="Footer">
            <a routerLink="/login">Sign in</a>
            <a routerLink="/register">Create an account</a>
            <a href="#download" (click)="go($event, 'download')">Download</a>
          </nav>
          <p>Product photos in the demo shop come from Open Food Facts and its sister projects (CC BY-SA). &copy; {{ year }} Small Mart.</p>
        </footer>
      </div>
    </ion-content>
  `,
})
export class LandingPage implements OnDestroy {
  protected readonly auth = inject(AuthService);
  private readonly content = viewChild.required(IonContent);
  private readonly page = viewChild.required<ElementRef<HTMLElement>>('page');

  protected readonly downloads = environment.downloadsUrl;
  protected readonly year = new Date().getFullYear();
  protected readonly scrolled = signal(false);
  /** People who ask their device for less motion get a still page. */
  protected readonly still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  protected readonly customerFeatures: Feature[] = [
    { icon: 'storefront', title: 'Shops near you', text: 'Browse the kirana stores, dairies and vegetable shops around you, with their timings and delivery fees.' },
    { icon: 'magnifying-glass', title: 'Find it fast', text: 'Search across every shop at once, or open a category and see what each shop has in stock.' },
    { icon: 'shopping-cart', title: 'Easy cart', text: 'Add items with one tap, see the MRP and what you save, and check out in under a minute.' },
    { icon: 'wallet', title: 'Pay your way', text: 'Cash on delivery, or pay by UPI with a QR code. The shop confirms your payment.' },
    { icon: 'moped', title: 'Live tracking', text: 'Follow your order from placed to packed to out for delivery, with a note at every step.' },
    { icon: 'bell', title: 'Never miss an update', text: 'Notifications when the shop accepts, packs and sends your order, and when payment is confirmed.' },
  ];

  protected readonly ownerFeatures: Feature[] = [
    { icon: 'sparkle', title: 'Add items from a photo. ', text: 'Snap the pack and the name, size and MRP are filled in for you.' },
    { icon: 'package', title: 'Stock that keeps itself. ', text: 'Stock goes down with every order, with a warning before you run out.' },
    { icon: 'receipt', title: 'Orders in one place. ', text: 'Accept, pack and dispatch with a tap. Customers see each step.' },
    { icon: 'qr-code', title: 'UPI without the worry. ', text: 'Check the transaction ID and screenshot before you accept an order.' },
  ];

  protected readonly steps: Feature[] = [
    { icon: 'storefront', title: 'Pick a shop', text: 'Choose from the shops near you and browse what they have today.' },
    { icon: 'shopping-bag', title: 'Fill your bag', text: 'Add what you need, then pay cash on delivery or by UPI.' },
    { icon: 'house', title: 'Get it delivered', text: 'Track the order live until it reaches your door.' },
  ];

  private frame = 0;
  private lastY = 0;
  private observer?: IntersectionObserver;

  ionViewDidEnter(): void {
    // Sections rise into view as they are scrolled to.
    const root = this.page().nativeElement;
    if (this.still || typeof IntersectionObserver !== 'function') {
      root.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
      return;
    }
    this.observer?.disconnect();
    this.observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), this.observer?.unobserve(e.target))),
      { threshold: 0.15 },
    );
    root.querySelectorAll('.reveal:not(.in)').forEach((el) => this.observer!.observe(el));
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    cancelAnimationFrame(this.frame);
  }

  /** The page's depth effects read the scroll position from CSS variables, updated once per frame. */
  protected onScroll(y: number): void {
    this.scrolled.set(y > 12);
    if (this.still) return;
    this.lastY = y;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const root = this.page().nativeElement;
      root.style.setProperty('--y', String(this.lastY));
      root.style.setProperty('--hero', String(Math.min(1, this.lastY / 700)));
    });
  }

  /** The hero phones lean gently towards the pointer. */
  protected tilt(event: PointerEvent | null): void {
    if (this.still || (event && event.pointerType !== 'mouse')) return;
    const root = this.page().nativeElement;
    const x = event ? event.clientX / window.innerWidth - 0.5 : 0;
    const y = event ? event.clientY / window.innerHeight - 0.5 : 0;
    root.style.setProperty('--mx', x.toFixed(3));
    root.style.setProperty('--my', y.toFixed(3));
  }

  protected async go(event: Event, id: string): Promise<void> {
    event.preventDefault();
    const target = this.page().nativeElement.querySelector<HTMLElement>(`#${id}`);
    if (target) await this.content().scrollToPoint(0, target.offsetTop - 72, this.still ? 0 : 700);
  }
}
