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
  imageUrl: string | null;
  quantity: number;
}

export interface Cart {
  /** The account the cart belongs to; someone else signing in on this device starts empty. */
  userId: string;
  shop: StoreShop;
  lines: CartLine[];
}

const KEY = 'smallmart.cart';
export const MAX_QUANTITY = 99;

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
    quantity = Math.max(0, Math.min(MAX_QUANTITY, Math.floor(quantity)));

    const current = this.state();
    const lines = current && current.shop.id === shop.id ? current.lines.filter((line) => line.itemId !== item.id) : [];
    if (quantity > 0) {
      lines.push({ itemId: item.id, name: item.name, unit: item.unit, price: item.price, imageUrl: item.imageUrl, quantity });
      lines.sort((a, b) => a.name.localeCompare(b.name));
    }
    this.set(lines.length ? { userId, shop, lines } : null);
  }

  changeLine(itemId: string, quantity: number): void {
    const cart = this.state();
    if (!cart) return;
    quantity = Math.max(0, Math.min(MAX_QUANTITY, Math.floor(quantity)));
    const lines = cart.lines
      .map((line) => (line.itemId === itemId ? { ...line, quantity } : line))
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
    const removed = cart.lines.filter((line) => !byId.has(line.itemId)).map((line) => line.name);
    let priceChanged = false;
    const lines = cart.lines
      .filter((line) => byId.has(line.itemId))
      .map((line) => {
        const item = byId.get(line.itemId)!;
        if (item.price !== line.price) priceChanged = true;
        return { ...line, name: item.name, unit: item.unit, price: item.price, imageUrl: item.imageUrl };
      });
    const feeChanged = shop.deliveryFee !== cart.shop.deliveryFee;
    this.set(lines.length ? { ...cart, shop, lines } : null);

    const notes: string[] = [];
    if (removed.length) notes.push(`No longer available and removed: ${removed.join(', ')}.`);
    if (priceChanged) notes.push('Some prices have changed.');
    if (feeChanged) notes.push('The delivery fee has changed.');
    return notes.join(' ');
  }

  private set(cart: Cart | null): void {
    this.state.set(cart);
    void (cart ? Preferences.set({ key: KEY, value: JSON.stringify(cart) }) : Preferences.remove({ key: KEY }));
  }
}
