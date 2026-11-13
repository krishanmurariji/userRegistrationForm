import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { AuthService } from './auth.service';
import { StoreItem, StoreShop } from './store.models';
import { StoreService } from './store.service';

export interface CartLine {
  itemId: string;
  name: string;
  unit: string;
  price: number;
  /** Printed maximum retail price, when it is above the price. Used to show the saving. */
  mrp: number | null;
  imageUrl: string | null;
  quantity: number;
  /** The most that can be ordered, or null when the shop does not count stock. */
  available: number | null;
}

export interface Cart {
  /** The account the cart belongs to; someone else signing in on this device starts empty. */
  userId: string;
  shop: StoreShop;
  lines: CartLine[];
}

const KEY = 'smallmart.cart';
export const MAX_QUANTITY = 99;

/** The most of an item one order may contain: 99, or fewer when the shop has fewer left. */
export function maxFor(available: number | null | undefined): number {
  return available === null || available === undefined ? MAX_QUANTITY : Math.max(0, Math.min(MAX_QUANTITY, available));
}

/**
 * The shopping cart. It holds items from one shop at a time and is kept on this device.
 * Prices here are only for display: the server prices every order itself.
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly auth = inject(AuthService);
  private readonly store = inject(StoreService);
  private readonly state = signal<Cart | null>(null);

  readonly cart = this.state.asReadonly();
  readonly count = computed(() => this.state()?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0);
  readonly subtotal = computed(() => this.state()?.lines.reduce((sum, line) => sum + line.price * line.quantity, 0) ?? 0);
  readonly total = computed(() => this.subtotal() + (this.state()?.shop.deliveryFee ?? 0));
  /** What the customer saves against the printed MRPs. */
  readonly savings = computed(
    () => this.state()?.lines.reduce((sum, line) => sum + Math.max(0, (line.mrp ?? line.price) - line.price) * line.quantity, 0) ?? 0,
  );
  readonly belowMinimum = computed(() => this.subtotal() < (this.state()?.shop.minimumOrder ?? 0));

  constructor() {
    // Signing out, or a different person signing in, empties the cart.
    effect(() => {
      const userId = this.auth.user()?.id;
      const cart = this.state();
      if (cart && cart.userId !== userId) this.set(null);
    });
  }

  async init(): Promise<void> {
    const { value } = await Preferences.get({ key: KEY });
    if (!value) return;
    try {
      const cart = JSON.parse(value) as Cart;
      if (cart.userId === this.auth.user()?.id) this.state.set(cart);
    } catch {
      // A damaged saved cart is simply dropped.
    }
  }

  quantityOf(itemId: string): number {
    return this.state()?.lines.find((line) => line.itemId === itemId)?.quantity ?? 0;
  }

  /** True when adding from this shop would mix two shops in one cart. */
  isOtherShop(shopId: string): boolean {
    const cart = this.state();
    return !!cart && cart.lines.length > 0 && cart.shop.id !== shopId;
  }

  /** Sets how many of an item are in the cart. Zero removes it. A different shop replaces the cart. */
  setQuantity(shop: StoreShop, item: StoreItem, quantity: number): void {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    quantity = Math.max(0, Math.min(maxFor(item.available), Math.floor(quantity)));

    const current = this.state();
    const lines = current && current.shop.id === shop.id ? current.lines.filter((line) => line.itemId !== item.id) : [];
    if (quantity > 0) {
      lines.push({ itemId: item.id, name: item.name, unit: item.unit, price: item.price, mrp: item.mrp, imageUrl: item.imageUrl, quantity, available: item.available });
      lines.sort((a, b) => a.name.localeCompare(b.name));
    }
    this.set(lines.length ? { userId, shop, lines } : null);
  }

  changeLine(itemId: string, quantity: number): void {
    const cart = this.state();
    if (!cart) return;
    const lines = cart.lines
      .map((line) => (line.itemId === itemId ? { ...line, quantity: Math.max(0, Math.min(maxFor(line.available), Math.floor(quantity))) } : line))
      .filter((line) => line.quantity > 0);
    this.set(lines.length ? { ...cart, lines } : null);
  }

  clear(): void {
    this.set(null);
  }

  /**
   * Brings the cart up to date with the shop: new prices, fees and opening state, and removes items that are
   * no longer sold. Returns a sentence describing what changed, or an empty string when nothing did.
   */
  async refresh(): Promise<string> {
    const cart = this.state();
    if (!cart) return '';

    let shop: StoreShop;
    let items: StoreItem[];
    try {
      [{ shop }, items] = await Promise.all([this.store.shop(cart.shop.id), this.store.items(cart.shop.id)]);
    } catch (error) {
      if ((error as { status?: number }).status === 404) {
        this.set(null);
        return `${cart.shop.name} is no longer available, so your cart was emptied.`;
      }
      throw error;
    }

    const byId = new Map(items.map((item) => [item.id, item]));
    // Gone from the shop, or sold out.
    const stillSold = (line: CartLine) => byId.has(line.itemId) && maxFor(byId.get(line.itemId)!.available) > 0;
    const removed = cart.lines.filter((line) => !stillSold(line)).map((line) => line.name);
    let priceChanged = false;
    const reduced: string[] = [];
    const lines = cart.lines.filter(stillSold).map((line) => {
      const item = byId.get(line.itemId)!;
      if (item.price !== line.price) priceChanged = true;
      const quantity = Math.min(line.quantity, maxFor(item.available));
      if (quantity < line.quantity) reduced.push(`${item.name} (only ${quantity} left)`);
      return { ...line, name: item.name, unit: item.unit, price: item.price, mrp: item.mrp, imageUrl: item.imageUrl, available: item.available, quantity };
    });
    const feeChanged = shop.deliveryFee !== cart.shop.deliveryFee;
    this.set(lines.length ? { ...cart, shop, lines } : null);

    const notes: string[] = [];
    if (removed.length) notes.push(`No longer available and removed: ${removed.join(', ')}.`);
    if (reduced.length) notes.push(`Quantity reduced: ${reduced.join(', ')}.`);
    if (priceChanged) notes.push('Some prices have changed.');
    if (feeChanged) notes.push('The delivery fee has changed.');
    return notes.join(' ');
  }

  private set(cart: Cart | null): void {
    this.state.set(cart);
    void (cart ? Preferences.set({ key: KEY, value: JSON.stringify(cart) }) : Preferences.remove({ key: KEY }));
  }
}
