import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface IncomingLine {
  itemId: string | null;
  name: string;
  unit: string;
  quantity: number;
  lineTotal: number;
  imageUrl: string | null;
  /** Units left after this order; null when the item does not track stock. */
  stockLeft: number | null;
  lowStockThreshold: number | null;
  itemRemoved: boolean;
}

export interface IncomingOrder {
  id: string;
  number: string;
  shopId: string;
  shopName: string;
  customerName: string;
  city: string;
  paymentMethod: 'CashOnDelivery' | 'Upi';
  paymentStatus: string;
  upiReference: string | null;
  hasUpiProof: boolean;
  subtotal: number;
  deliveryFee: number;
  total: number;
  note: string | null;
  createdAt: string;
  canAccept: boolean;
  items: IncomingLine[];
}

/** Checks often while the app is open, so a new order shows within seconds even without push notifications. */
const POLL_MS = 15_000;
/** "Decide later" hides an order for this long, then it comes back. */
const SNOOZE_MS = 3 * 60_000;

/**
 * New orders waiting for the signed-in shop owner. Drives the full-screen alert: the oldest order not snoozed is shown
 * until it is accepted or declined, so no order is missed.
 */
@Injectable({ providedIn: 'root' })
export class IncomingOrdersService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly api = `${environment.apiUrl}/api/owner/incoming-orders`;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly seen = new Set<string>();
  private readonly snoozed = signal<Record<string, number>>({});
  private readonly now = signal(Date.now());

  readonly orders = signal<IncomingOrder[]>([]);
  /** Told when an order is accepted or declined here, so the phone can clear its ringing notification. */
  handled: ((orderId: string) => void) | null = null;
  /** Orders the alert should show now, oldest first. */
  readonly waiting = computed(() => {
    const until = this.snoozed();
    const now = this.now();
    return this.orders().filter((o) => !(until[o.id] > now));
  });
  /** Orders put off with "Decide later". */
  readonly later = computed(() => this.orders().length - this.waiting().length);

  constructor() {
    effect(() => {
      const owner = this.auth.isShopOwner();
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      if (!owner) {
        this.orders.set([]);
        this.seen.clear();
        return;
      }
      void this.refresh();
      this.timer = setInterval(() => {
        this.now.set(Date.now());
        void this.refresh();
      }, POLL_MS);
    });
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => !document.hidden && this.auth.isShopOwner() && void this.refresh());
    }
  }

  async refresh(): Promise<void> {
    if (!this.auth.isShopOwner()) return;
    try {
      const orders = await firstValueFrom(this.http.get<IncomingOrder[]>(this.api));
      const fresh = orders.filter((o) => !this.seen.has(o.id));
      fresh.forEach((o) => this.seen.add(o.id));
      this.orders.set(orders);
      this.now.set(Date.now());
      if (fresh.length) this.announce(fresh);
    } catch {
      // Offline for a moment: keep what we have and try again on the next tick.
    }
  }

  async accept(order: IncomingOrder): Promise<void> {
    await firstValueFrom(this.http.post(`${this.api}/${order.id}/accept`, null));
    this.drop(order.id);
  }

  async decline(order: IncomingOrder, reason: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.api}/${order.id}/decline`, { reason }));
    this.drop(order.id);
  }

  snooze(order: IncomingOrder): void {
    this.snoozed.update((s) => ({ ...s, [order.id]: Date.now() + SNOOZE_MS }));
  }

  /** Brings every snoozed order back. */
  showAll(): void {
    this.snoozed.set({});
    this.now.set(Date.now());
  }

  /** Removes an order someone else already handled (for example on another phone). */
  drop(id: string): void {
    this.orders.update((list) => list.filter((o) => o.id !== id));
    this.handled?.(id);
  }

  /** When the app is in the background on the web or desktop, a system notification points to the new order. */
  private announce(orders: IncomingOrder[]): void {
    if (typeof document === 'undefined' || !document.hidden || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    for (const o of orders.slice(0, 3)) {
      const note = new Notification(`New order ${o.number} · ₹${o.total}`, {
        body: `${o.customerName} · ${o.items.length} ${o.items.length === 1 ? 'item' : 'items'} · ${o.shopName}`,
        icon: 'brand/icon-192.png',
        tag: `order-${o.id}`,
        requireInteraction: true,
      });
      note.onclick = () => {
        window.focus();
        note.close();
      };
    }
  }

  /** Asks once for permission to show system notifications (web and desktop). */
  askForNotifications(): void {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission();
  }
}
