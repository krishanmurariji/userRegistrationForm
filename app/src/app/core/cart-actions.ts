import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { CartService, maxFor } from './cart.service';
import { Order, StoreItem, StoreShop } from './store.models';
import { StoreService } from './store.service';

/** Cart changes that may need to ask the customer something first. */
@Injectable({ providedIn: 'root' })
export class CartActions {
  private readonly cart = inject(CartService);
  private readonly store = inject(StoreService);
  private readonly alerts = inject(AlertController);
  private readonly router = inject(Router);

  /** Sets the quantity of an item. Adding from a different shop first asks whether to start a new cart. */
  async set(shop: StoreShop, item: StoreItem, quantity: number): Promise<void> {
    if (quantity > 0 && this.cart.isOtherShop(shop.id) && !(await this.confirmNewCart(shop))) return;
    this.cart.setQuantity(shop, item, quantity);
  }

  /**
   * Puts an earlier order's items back in the cart at today's prices and opens the cart.
   * Returns a sentence about anything that could not be added, or an empty string.
   */
  async orderAgain(order: Order): Promise<string> {
    const [{ shop }, items] = await Promise.all([this.store.shop(order.shopId), this.store.items(order.shopId)]);
    if (this.cart.isOtherShop(shop.id) && !(await this.confirmNewCart(shop))) return '';

    const byId = new Map(items.map((item) => [item.id, item]));
    const missing: string[] = [];
    this.cart.clear();
    for (const line of order.items) {
      const item = line.itemId ? byId.get(line.itemId) : undefined;
      const quantity = item ? Math.min(line.quantity, maxFor(item.available)) : 0;
      if (item && quantity > 0) this.cart.setQuantity(shop, item, quantity);
      if (!item || quantity < line.quantity) missing.push(line.name);
    }
    if (this.cart.count() === 0) return 'None of these items are available right now.';
    await this.router.navigateByUrl('/cart');
    return missing.length ? `Not fully available: ${missing.join(', ')}.` : '';
  }

  private async confirmNewCart(shop: StoreShop): Promise<boolean> {
    const alert = await this.alerts.create({
      header: 'Start a new cart?',
      message: `Your cart has items from ${this.cart.cart()!.shop.name}. An order can come from one shop only, so adding from ${shop.name} will empty it.`,
      buttons: [{ text: 'Keep my cart', role: 'cancel' }, { text: 'Start new cart', role: 'confirm' }],
    });
    await alert.present();
    return (await alert.onDidDismiss()).role === 'confirm';
  }
}
