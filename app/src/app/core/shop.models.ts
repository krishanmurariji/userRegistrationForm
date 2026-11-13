export interface Shop {
  id: string;
  name: string;
  description: string | null;
  phone: string;
  addressLine: string;
  city: string;
  pincode: string;
  upiId: string | null;
  deliveryFee: number;
  minimumOrder: number;
  isOpen: boolean;
  /** False when the platform admin has deactivated the shop; it is then read-only. */
  isActive: boolean;
  logoUrl: string | null;
  myRole: 'Owner' | 'Manager' | 'Staff';
}

export type ShopInput = Omit<Shop, 'id' | 'logoUrl' | 'myRole' | 'isActive'>;

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  itemCount: number;
}

export interface Item {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  price: number;
  mrp: number | null;
  unit: string;
  barcode: string | null;
  isActive: boolean;
  imageUrl: string | null;
  /** When false the item is always available and the stock number is ignored. */
  trackStock: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
}

export type ItemInput = Omit<Item, 'id' | 'imageUrl' | 'stockQuantity'> & {
  /** Used when the item is created with stock counting, or when counting is switched on. */
  openingStock: number | null;
  /** Put the item in a category with this name, creating it if the shop does not have it yet. */
  newCategoryName?: string | null;
};

export type StockReason = 'Opening' | 'Restock' | 'Sale' | 'OrderCancelled' | 'Damage' | 'Correction';

export interface StockMovement {
  id: number;
  at: string;
  change: number;
  quantityAfter: number;
  reason: StockReason;
  note: string | null;
  orderNumber: string | null;
}

/** How an item's stock should be described on the shop's screens, or null when it is not counted. */
export function stockState(item: Pick<Item, 'trackStock' | 'stockQuantity' | 'lowStockThreshold'>): { label: string; color: string } | null {
  if (!item.trackStock) return null;
  if (item.stockQuantity <= 0) return { label: 'Out of stock', color: 'danger' };
  if (item.stockQuantity <= item.lowStockThreshold) return { label: `Low: ${item.stockQuantity} left`, color: 'warning' };
  return { label: `${item.stockQuantity} in stock`, color: 'light' };
}

/** One value pre-filled from a photo scan, and where it came from. */
export interface ScanField<T> {
  value: T | null;
  /** "photo", "barcode" (public product database), "catalog" (saved by a shop before), "web", or null when empty. */
  source: 'photo' | 'barcode' | 'catalog' | 'web' | null;
  /** True when the value is a guess or could not be confirmed. */
  needsReview: boolean;
}

/** A draft item read from a photo. There is no selling price: the shop sets that. */
export interface ScanProduct {
  name: ScanField<string>;
  brand: ScanField<string>;
  unit: ScanField<string>;
  mrp: ScanField<number>;
  barcode: ScanField<string>;
  category: ScanField<string>;
  description: ScanField<string>;
}

export interface ScanStatus {
  enabled: boolean;
  remainingToday: number;
  dailyLimit: number;
}
