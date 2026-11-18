import { CurrencyPipe } from '@angular/common';
import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { toApiError } from './api-error';
import { AppIcon } from './icon';
import { IncomingLine, IncomingOrder, IncomingOrdersService } from './incoming-orders';
import { fileUrl } from './shop.service';

const REASONS = ['Some items are out of stock', 'The shop is closing now', 'We cannot deliver to this area', 'Too busy right now'];

type StockLook = { label: string; tone: 'ok' | 'low' | 'out' | 'none' };

/**
 * Full-screen alert for shop owners: every new order takes over the screen with Accept and Decline until the owner
 * decides, with the stock left for each item so the decision is quick. Plays a chime and vibrates while it waits.
 */
@Component({
  selector: 'app-order-alert',
  imports: [CurrencyPipe, AppIcon],
  template: `
    @if (current(); as o) {
      <div class="order-alert" role="alertdialog" aria-modal="true" [attr.aria-label]="'New order ' + o.number" animate.enter="oa-in" animate.leave="oa-out">
        <div class="oa-sheet">
          <header class="oa-top">
            <span class="oa-bell"><app-icon name="bell" weight="fill" /></span>
            <span class="oa-title">
              <small>{{ o.shopName }}</small>
              <strong>New order {{ o.number }}</strong>
              <span>{{ ago(o.createdAt) }}@if (service.waiting().length > 1) { · {{ service.waiting().length - 1 }} more waiting }</span>
            </span>
            <button type="button" class="oa-mute" (click)="toggleSound()" [attr.aria-label]="muted() ? 'Turn sound on' : 'Turn sound off'">
              <app-icon [name]="muted() ? 'speaker-slash' : 'speaker-high'" />
            </button>
          </header>

          <div class="oa-body">
            <section class="oa-who">
              <span class="oa-avatar">{{ initials(o.customerName) }}</span>
              <span class="what"><strong>{{ o.customerName }}</strong><small><app-icon name="map-pin" />{{ o.city }}</small></span>
              <span class="oa-total"><small>Total</small><b>{{ o.total | currency: 'INR' : 'symbol' : '1.0-2' }}</b></span>
            </section>

            <div class="oa-pay" [attr.data-kind]="o.paymentMethod">
              @if (o.paymentMethod === 'Upi') {
                <app-icon name="qr-code" weight="duotone" />
                <span><strong>Paid by UPI · check your UPI app</strong><small>Transaction ID {{ o.upiReference }}</small></span>
              } @else {
                <app-icon name="money" weight="duotone" />
                <span><strong>Cash on delivery</strong><small>Collect {{ o.total | currency: 'INR' : 'symbol' : '1.0-2' }} at the door</small></span>
              }
            </div>

            <div class="oa-stock-summary" [attr.data-tone]="summary(o).tone">
              <app-icon [name]="summary(o).tone === 'ok' ? 'check-circle' : 'warning'" weight="duotone" />{{ summary(o).text }}
            </div>

            <ul class="oa-items">
              @for (line of o.items; track $index) {
                @let look = stock(line);
                <li>
                  <span class="thumb">
                    @if (image(line); as src) { <img [src]="src" alt="" /> } @else { <app-icon name="package" weight="duotone" /> }
                  </span>
                  <span class="what">
                    <strong>{{ line.name }}</strong>
                    <small>{{ line.unit }} · {{ line.lineTotal | currency: 'INR' : 'symbol' : '1.0-2' }}</small>
                  </span>
                  <span class="qty">×{{ line.quantity }}</span>
                  <span class="stock" [attr.data-tone]="look.tone">{{ look.label }}</span>
                </li>
              }
            </ul>

            @if (o.note) {
              <div class="oa-note"><app-icon name="note-pencil" weight="duotone" /><span><strong>Note</strong>{{ o.note }}</span></div>
            }
            @if (error(); as message) { <p class="oa-error" role="alert">{{ message }}</p> }
          </div>

          @if (declining()) {
            <div class="oa-decline">
              <strong>Why are you declining?</strong>
              <div class="oa-reasons">
                @for (r of reasons; track r) {
                  <button type="button" [class.on]="reason() === r" (click)="reason.set(r)">{{ r }}</button>
                }
              </div>
              <div class="oa-actions">
                <button type="button" class="oa-btn ghost" [disabled]="busy()" (click)="declining.set(false)">Back</button>
                <button type="button" class="oa-btn danger" [disabled]="busy() || !reason()" (click)="decline(o)">
                  <app-icon name="x-circle" />Decline order
                </button>
              </div>
            </div>
          } @else {
            <footer class="oa-foot">
              <div class="oa-actions">
                <button type="button" class="oa-btn decline" [disabled]="busy()" (click)="startDecline()"><app-icon name="x" />Decline</button>
                <button type="button" class="oa-btn accept" [disabled]="busy() || !o.canAccept" (click)="accept(o)">
                  <app-icon name="check" />{{ o.paymentMethod === 'Upi' ? 'Payment received · Accept' : 'Accept order' }}
                </button>
              </div>
              <div class="oa-links">
                <button type="button" (click)="later(o)">Decide later</button>
                <button type="button" (click)="details(o)">Full details</button>
              </div>
            </footer>
          }
        </div>
      </div>
    } @else if (service.later(); as n) {
      <button type="button" class="oa-pill" (click)="service.showAll()" animate.enter="oa-pill-in">
        <app-icon name="bell" weight="fill" />{{ n }} {{ n === 1 ? 'order' : 'orders' }} waiting
      </button>
    }
  `,
})
export class OrderAlert implements OnDestroy {
  protected readonly service = inject(IncomingOrdersService);
  private readonly router = inject(Router);

  protected readonly reasons = REASONS;
  protected readonly current = computed(() => this.service.waiting()[0] ?? null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly declining = signal(false);
  protected readonly reason = signal('');
  protected readonly muted = signal(readMuted());

  private chime: ReturnType<typeof setInterval> | null = null;
  private audio: AudioContext | null = null;

  constructor() {
    // Ring while an order is on screen.
    effect(() => {
      const order = this.current();
      this.error.set('');
      this.declining.set(false);
      this.reason.set('');
      this.stopChime();
      if (order) this.startChime();
    });
    if (!Capacitor.isNativePlatform()) this.service.askForNotifications();
  }

  ngOnDestroy(): void {
    this.stopChime();
  }

  protected async accept(order: IncomingOrder): Promise<void> {
    await this.act(() => this.service.accept(order), order);
  }

  protected startDecline(): void {
    this.declining.set(true);
    this.stopChime();
  }

  protected async decline(order: IncomingOrder): Promise<void> {
    await this.act(() => this.service.decline(order, this.reason()), order);
  }

  protected later(order: IncomingOrder): void {
    this.service.snooze(order);
  }

  protected details(order: IncomingOrder): void {
    this.service.snooze(order);
    void this.router.navigate(['/shops', order.shopId, 'orders', order.id]);
  }

  protected toggleSound(): void {
    this.muted.update((m) => !m);
    try {
      localStorage.setItem('smallmart.alertMuted', this.muted() ? '1' : '0');
    } catch {
      // Private mode: the choice lasts until the app closes.
    }
    if (this.muted()) this.stopChime();
    else if (this.current()) this.startChime();
  }

  private async act(work: () => Promise<void>, order: IncomingOrder): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await work();
    } catch (e) {
      const err = toApiError(e);
      if (err.code === 'already_handled' || err.code === 'not_found') this.service.drop(order.id);
      else this.error.set(err.message);
    } finally {
      this.busy.set(false);
    }
  }

  protected stock(line: IncomingLine): StockLook {
    if (line.itemRemoved) return { label: 'Item removed', tone: 'out' };
    if (line.stockLeft === null) return { label: 'Not tracked', tone: 'none' };
    if (line.stockLeft <= 0) return { label: 'None left after this', tone: 'out' };
    if (line.lowStockThreshold !== null && line.stockLeft <= line.lowStockThreshold) return { label: `Only ${line.stockLeft} left`, tone: 'low' };
    return { label: `${line.stockLeft} left`, tone: 'ok' };
  }

  protected summary(order: IncomingOrder): { text: string; tone: 'ok' | 'low' | 'out' } {
    const looks = order.items.map((l) => this.stock(l).tone);
    const out = looks.filter((t) => t === 'out').length;
    const low = looks.filter((t) => t === 'low').length;
    if (out) return { text: `${out} ${out === 1 ? 'item' : 'items'} will be sold out after this order`, tone: 'out' };
    if (low) return { text: `${low} ${low === 1 ? 'item is' : 'items are'} running low`, tone: 'low' };
    return { text: 'Everything is in stock', tone: 'ok' };
  }

  protected image(line: IncomingLine): string | null {
    return fileUrl(line.imageUrl);
  }

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  protected ago(at: string): string {
    const minutes = Math.floor((Date.now() - new Date(at).getTime()) / 60_000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }

  /** A soft two-note chime every few seconds, for up to two minutes, plus a vibration on phones. */
  private startChime(): void {
    if (this.muted()) return;
    let rings = 0;
    const ring = () => {
      if (++rings > 30) return this.stopChime();
      this.playChime();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate([250, 120, 250]);
    };
    ring();
    this.chime = setInterval(ring, 4000);
  }

  private stopChime(): void {
    if (this.chime) clearInterval(this.chime);
    this.chime = null;
  }

  private playChime(): void {
    try {
      this.audio ??= new AudioContext();
      const ctx = this.audio;
      if (ctx.state === 'suspended') void ctx.resume();
      [880, 1318.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + i * 0.18;
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.55);
      });
    } catch {
      // No audio available: the alert is still on screen.
    }
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem('smallmart.alertMuted') === '1';
  } catch {
    return false;
  }
}
