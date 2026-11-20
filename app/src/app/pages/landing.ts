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

interface Floater {
  art: string;
  /** Position in the section, in percent. */
  x: number;
  y: number;
  /** Depth: bigger moves more with scrolling and the pointer. */
  d: number;
  size: number;
  rotate: number;
  /** Hidden on small screens to keep the phone layout calm. */
  wide?: boolean;
}

interface Bay {
  name: string;
  icon: string;
  items: { art: string; price: number }[];
}

interface Step extends Feature {
  screen: string;
  chip: string;
  chipIcon: string;
}

/**
 * The public front page of the website, told as a walk into a neighbourhood kirana: the street scene zooms into the
 * shop as you scroll, groceries float past, the phone walks through an order, the shelves slide by, and shop owners
 * see their side. The Android, iOS and Windows apps open the sign-in page instead.
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
            <a href="#how" (click)="go($event, 'how')">How it works</a>
            <a href="#shops" (click)="go($event, 'shops')">For shops</a>
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

        <!-- 1. The street: scrolling walks you into the shop -->
        <section class="lp-street" data-pin="street">
          <div class="lp-street-stage">
            <div class="lp-sky" aria-hidden="true"></div>
            <div class="lp-sun" aria-hidden="true"></div>
            <div class="lp-birds" aria-hidden="true"><i></i><i></i><i></i></div>
            <div class="lp-scene" aria-hidden="true">
              <img class="lp-layer far" src="landing/art/far.svg" alt="" />
              <img class="lp-layer mid" src="landing/art/mid.svg" alt="" />
              <img class="lp-layer shop" src="landing/art/shop.svg" alt="" />
              <img class="lp-layer fg" src="landing/art/fg.svg" alt="" />
              <img class="lp-scooter" src="landing/art/scooter.svg" alt="" />
            </div>

            <div class="lp-street-copy">
              <span class="lp-eyebrow"><app-icon name="map-pin" weight="duotone" />Your local shops, now online</span>
              <h1>The kirana you trust,<br /><em>now on your phone.</em></h1>
              <p class="lp-lead">Order groceries from the shops around you. Pay cash or UPI, and follow your order to the door.</p>
              <div class="lp-cta">
                <a routerLink="/register" class="lp-btn big">Start shopping <app-icon name="arrow-right" /></a>
                <a href="#download" class="lp-btn ghost big" (click)="go($event, 'download')">Get the app</a>
              </div>
            </div>

            <div class="lp-street-phone" aria-hidden="true">
              <figure class="lp-device"><img src="landing/screens/home.webp" alt="" /></figure>
            </div>
            <p class="lp-street-next" aria-hidden="true">The whole shop,<br /><em>in your pocket.</em></p>
            <span class="lp-scroll-hint" aria-hidden="true"><i></i>Scroll to step inside</span>
          </div>
        </section>

        <!-- 2. Groceries floating at different depths -->
        <section id="features" class="lp-cloud" data-view>
          <div class="lp-floaters" aria-hidden="true">
            @for (f of floaters; track f.art + f.x) {
              <img class="lp-floater" [class.wide]="f.wide" [src]="'landing/art/p-' + f.art + '.svg'" alt=""
                [style.left.%]="f.x" [style.top.%]="f.y" [style.width.px]="f.size"
                [style.--d]="f.d" [style.--r]="f.rotate + 'deg'" />
            }
          </div>
          <div class="lp-cloud-copy reveal">
            <span class="lp-kicker">For customers</span>
            <h2>From atta to zeera,<br />everything for the daily shop</h2>
            <p>Browse the shops around you, see MRP and what you save, and check out in under a minute.</p>
          </div>
          <div class="lp-feature-grid">
            @for (f of customerFeatures; track f.title; let i = $index) {
              <article class="lp-feature reveal" [style.--i]="i">
                <span class="lp-icon"><app-icon [name]="f.icon" weight="duotone" /></span>
                <h3>{{ f.title }}</h3>
                <p>{{ f.text }}</p>
              </article>
            }
          </div>
        </section>

        <!-- 3. The phone walks through an order -->
        <section id="how" class="lp-story" data-pin="story" [attr.data-step]="step()">
          <div class="lp-story-stage">
            <div class="lp-story-copy">
              <span class="lp-kicker">How it works</span>
              <h2>From your phone to your door</h2>
              <ol class="lp-story-steps">
                @for (s of steps; track s.title; let i = $index) {
                  <li [class.on]="step() === i" [class.done]="step() > i">
                    <span class="lp-step-no">{{ i + 1 }}</span>
                    <span class="lp-step-text"><strong>{{ s.title }}</strong><small>{{ s.text }}</small></span>
                  </li>
                }
              </ol>
              <div class="lp-story-bar" aria-hidden="true"><i></i></div>
            </div>
            <div class="lp-story-art" aria-hidden="true">
              <div class="lp-story-ring"></div>
              <figure class="lp-device big">
                @for (s of steps; track s.screen; let i = $index) {
                  <img [src]="'landing/screens/' + s.screen + '.webp'" alt="" [class.on]="step() === i" />
                }
              </figure>
              @for (s of steps; track s.chip; let i = $index) {
                <div class="lp-chip" [class.on]="step() === i" [attr.data-at]="i">
                  <span class="dot"><app-icon [name]="s.chipIcon" weight="duotone" /></span>{{ s.chip }}
                </div>
              }
            </div>
          </div>
        </section>

        <!-- 4. Walk along the shelves -->
        <section class="lp-aisle" data-pin="aisle">
          <div class="lp-aisle-stage">
            <div class="lp-aisle-head">
              <span class="lp-kicker">Every aisle</span>
              <h2>Walk the shelves of your neighbourhood shop</h2>
            </div>
            <div class="lp-aisle-track" #track>
              @for (bay of bays; track bay.name) {
                <div class="lp-bay">
                  <span class="lp-bay-sign"><app-icon [name]="bay.icon" weight="duotone" />{{ bay.name }}</span>
                  <div class="lp-shelf">
                    @for (item of bay.items; track item.art) {
                      <span class="lp-shelf-item">
                        <img [src]="'landing/art/p-' + item.art + '.svg'" alt="" loading="lazy" />
                        <b>₹{{ item.price }}</b>
                      </span>
                    }
                  </div>
                </div>
              }
              <a class="lp-bay lp-bay-end" routerLink="/register">
                <span class="lp-icon"><app-icon name="storefront" weight="duotone" /></span>
                <strong>And everything else the shop stocks</strong>
                <span class="lp-btn">Browse shops <app-icon name="arrow-right" /></span>
              </a>
            </div>
          </div>
        </section>

        <!-- 5. For shop owners -->
        <section id="shops" class="lp-owners" data-view>
          <div class="lp-owners-inner">
            <div class="lp-owners-copy reveal">
              <span class="lp-kicker light">For shop owners</span>
              <h2>Take your shop online in an afternoon</h2>
              <p>List your items, take orders and get paid, all from your phone. No website to build, no tech skills needed.</p>
              <ul class="lp-checks">
                @for (f of ownerFeatures; track f.title) {
                  <li><span class="lp-icon small"><app-icon [name]="f.icon" weight="duotone" /></span><span><strong>{{ f.title }}</strong>{{ f.text }}</span></li>
                }
              </ul>
              <a routerLink="/register" class="lp-btn big light">Open your shop <app-icon name="arrow-right" /></a>
            </div>
            <div class="lp-owners-art" aria-hidden="true">
              <figure class="lp-device tilt-a"><img src="landing/screens/owner.webp" alt="" loading="lazy" /></figure>
              <figure class="lp-device tilt-b"><img src="landing/screens/alert.webp" alt="" loading="lazy" /></figure>
              <div class="lp-chip on dark c1"><span class="dot"><app-icon name="bell" weight="fill" /></span>New order · ₹445</div>
              <div class="lp-chip on dark c2"><span class="dot"><app-icon name="package" weight="duotone" /></span>Amul Butter: 4 left</div>
              <div class="lp-chip on dark c3"><span class="dot"><app-icon name="sparkle" weight="duotone" /></span>Added from a photo</div>
            </div>
          </div>
        </section>

        <!-- 6. Download -->
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
          <div class="lp-install reveal">
            <app-icon name="shield-check" weight="duotone" />
            <p><strong>Installing on Android:</strong> open the downloaded file and, if your phone asks, allow your browser to
              “install unknown apps”. Small Mart is signed by us and tells you inside the app when a newer version is ready.
              <strong>On Windows:</strong> if SmartScreen appears, choose “More info”, then “Run anyway”.</p>
          </div>
        </section>

        <!-- 7. The shop at night -->
        <section class="lp-night" data-view>
          <div class="lp-night-sky" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
          <div class="lp-night-copy reveal">
            <img src="brand/logo-mark.svg" alt="" width="64" height="64" />
            <h2>Your shop never closes now</h2>
            <p>Create a free account and order from the shops near you tonight.</p>
            <div class="lp-cta center">
              <a routerLink="/register" class="lp-btn big light">Create an account</a>
              <a routerLink="/login" class="lp-btn ghost big light">Sign in</a>
            </div>
          </div>
          <img class="lp-night-shop" src="landing/art/shop.svg" alt="" aria-hidden="true" loading="lazy" />
        </section>

        <footer class="lp-footer">
          <div class="lp-brand"><img src="brand/logo-mark.svg" alt="" width="28" height="28" /><span>Small Mart</span></div>
          <nav aria-label="Footer">
            <a routerLink="/login">Sign in</a>
            <a routerLink="/register">Create an account</a>
            <a href="#download" (click)="go($event, 'download')">Download</a>
            <a routerLink="/privacy">Privacy policy</a>
            <a routerLink="/delete-account">Delete account</a>
          </nav>
          <p>Illustrations by Small Mart. &copy; {{ year }} Small Mart.</p>
        </footer>
      </div>
    </ion-content>
  `,
})
export class LandingPage implements OnDestroy {
  protected readonly auth = inject(AuthService);
  private readonly content = viewChild.required(IonContent);
  private readonly page = viewChild.required<ElementRef<HTMLElement>>('page');
  private readonly track = viewChild<ElementRef<HTMLElement>>('track');

  protected readonly downloads = environment.downloadsUrl;
  protected readonly year = new Date().getFullYear();
  protected readonly scrolled = signal(false);
  protected readonly step = signal(0);
  /** People who ask their device for less motion get a still page. */
  protected readonly still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  protected readonly floaters: Floater[] = [
    { art: 'atta', x: 3, y: 4, d: 1.2, size: 150, rotate: -10 },
    { art: 'milk', x: 84, y: 6, d: 0.8, size: 120, rotate: 8 },
    { art: 'tomato', x: 16, y: 44, d: 0.5, size: 90, rotate: 0, wide: true },
    { art: 'chai', x: 76, y: 38, d: 1.4, size: 140, rotate: 12, wide: true },
    { art: 'biscuit', x: 2, y: 70, d: 0.9, size: 150, rotate: 6, wide: true },
    { art: 'banana', x: 88, y: 66, d: 0.6, size: 120, rotate: -14, wide: true },
    { art: 'spice', x: 30, y: 2, d: 0.4, size: 80, rotate: 10, wide: true },
    { art: 'chips', x: 62, y: 4, d: 1, size: 100, rotate: -8, wide: true },
    { art: 'onion', x: 68, y: 74, d: 0.7, size: 80, rotate: 0, wide: true },
    { art: 'oil', x: 24, y: 78, d: 1.1, size: 100, rotate: -6, wide: true },
  ];

  protected readonly bays: Bay[] = [
    { name: 'Atta, rice & dal', icon: 'grains', items: [{ art: 'atta', price: 265 }, { art: 'rice', price: 189 }, { art: 'dal', price: 140 }] },
    { name: 'Dairy & eggs', icon: 'cow', items: [{ art: 'milk', price: 32 }, { art: 'butter', price: 56 }, { art: 'eggs', price: 84 }] },
    { name: 'Fruits & vegetables', icon: 'carrot', items: [{ art: 'tomato', price: 30 }, { art: 'onion', price: 40 }, { art: 'banana', price: 60 }, { art: 'coconut', price: 45 }] },
    { name: 'Tea & snacks', icon: 'coffee', items: [{ art: 'chai', price: 145 }, { art: 'biscuit', price: 30 }, { art: 'chips', price: 20 }] },
    { name: 'Masala & oil', icon: 'pepper', items: [{ art: 'spice', price: 72 }, { art: 'oil', price: 185 }] },
    { name: 'Bakery & home', icon: 'bread', items: [{ art: 'bread', price: 45 }, { art: 'soap', price: 38 }] },
  ];

  protected readonly customerFeatures: Feature[] = [
    { icon: 'storefront', title: 'Shops near you', text: 'The kirana stores, dairies and vegetable shops around you, with timings and delivery fees.' },
    { icon: 'magnifying-glass', title: 'Find it fast', text: 'Search every shop at once, or open a category and see what is in stock.' },
    { icon: 'shopping-cart', title: 'Easy cart', text: 'One tap to add, MRP and savings shown, checkout in under a minute.' },
    { icon: 'wallet', title: 'Pay your way', text: 'Cash on delivery, or UPI with a QR code. The shop confirms your payment.' },
    { icon: 'moped', title: 'Live tracking', text: 'Placed, packed, out for delivery: follow every step with a note.' },
    { icon: 'bell', title: 'Never miss an update', text: 'Notifications when the shop accepts, packs and sends your order.' },
  ];

  protected readonly ownerFeatures: Feature[] = [
    { icon: 'bell', title: 'Never miss an order. ', text: 'A full-screen alert with Accept and Decline, and the stock left for every item.' },
    { icon: 'sparkle', title: 'Add items from a photo. ', text: 'Snap the pack and the name, size and MRP are filled in for you.' },
    { icon: 'package', title: 'Stock that keeps itself. ', text: 'Stock goes down with every order, with a warning before you run out.' },
    { icon: 'qr-code', title: 'UPI without the worry. ', text: 'Check the transaction ID and screenshot before you accept an order.' },
  ];

  protected readonly steps: Step[] = [
    { icon: 'storefront', title: 'Pick a shop', text: 'The shops near you, with what they have today.', screen: 'home', chip: '3 shops deliver to you', chipIcon: 'map-pin' },
    { icon: 'shopping-bag', title: 'Fill your bag', text: 'Every aisle of the shop, with MRP and savings.', screen: 'store', chip: 'You save ₹44', chipIcon: 'tag' },
    { icon: 'wallet', title: 'Pay your way', text: 'Cash on delivery, or UPI the shop confirms.', screen: 'cart', chip: 'UPI payment confirmed', chipIcon: 'qr-code' },
    { icon: 'moped', title: 'Track it home', text: 'Accepted, packed, on the way, delivered.', screen: 'tracking', chip: 'Arriving in 20 min', chipIcon: 'moped' },
  ];

  private frame = 0;
  private lastY = 0;
  private viewport = 800;
  private zones: { el: HTMLElement; top: number; height: number; pin: string | null }[] = [];
  private observer?: IntersectionObserver;
  private readonly onResize = () => {
    this.measure();
    this.update();
  };

  ionViewDidEnter(): void {
    const root = this.page().nativeElement;
    // Sections rise into view as they are scrolled to.
    if (this.still || typeof IntersectionObserver !== 'function') {
      root.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
    } else {
      this.observer?.disconnect();
      this.observer = new IntersectionObserver(
        (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), this.observer?.unobserve(e.target))),
        { threshold: 0.12 },
      );
      root.querySelectorAll('.reveal:not(.in)').forEach((el) => this.observer!.observe(el));
    }
    window.addEventListener('resize', this.onResize);
    this.measure();
    this.update();
    // Images change section heights as they load.
    setTimeout(this.onResize, 600);
  }

  ionViewWillLeave(): void {
    window.removeEventListener('resize', this.onResize);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    window.removeEventListener('resize', this.onResize);
    cancelAnimationFrame(this.frame);
  }

  protected onScroll(y: number): void {
    this.scrolled.set(y > 12);
    if (this.still) return;
    this.lastY = y;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.update());
  }

  /** Remembers where each animated section sits, so scrolling only does arithmetic. */
  private measure(): void {
    this.viewport = window.innerHeight;
    this.zones = Array.from(this.page().nativeElement.querySelectorAll<HTMLElement>('[data-pin], [data-view]')).map((el) => ({
      el,
      top: el.offsetTop,
      height: el.offsetHeight,
      pin: el.getAttribute('data-pin'),
    }));
  }

  /**
   * Pinned sections get --p, from 0 when they reach the top of the screen to 1 when they leave. Other sections get --v,
   * from -1 (below the screen) through 0 (centred) to 1 (above). The CSS turns these into movement.
   */
  private update(): void {
    if (this.still) return;
    const y = this.lastY;
    const vh = this.viewport;
    for (const z of this.zones) {
      if (z.pin) {
        const p = clamp((y - z.top) / Math.max(1, z.height - vh), 0, 1);
        z.el.style.setProperty('--p', p.toFixed(4));
        if (z.pin === 'street') z.el.style.setProperty('--q', clamp((p - 0.42) / 0.5, 0, 1).toFixed(4));
        if (z.pin === 'story') {
          const step = Math.min(this.steps.length - 1, Math.floor(p * this.steps.length * 0.999));
          if (step !== this.step()) this.step.set(step);
        }
        if (z.pin === 'aisle') {
          const track = this.track()?.nativeElement;
          if (track) z.el.style.setProperty('--shift', `${(-p * Math.max(0, track.scrollWidth - track.clientWidth)).toFixed(1)}px`);
        }
      } else {
        const v = clamp((y + vh / 2 - (z.top + z.height / 2)) / ((vh + z.height) / 2), -1, 1);
        z.el.style.setProperty('--v', v.toFixed(4));
      }
    }
  }

  /** Floating groceries and phones lean towards the pointer. */
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
    if (target) await this.content().scrollToPoint(0, target.offsetTop - 64, this.still ? 0 : 900);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
