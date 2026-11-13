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
}

export type ItemInput = Omit<Item, 'id' | 'imageUrl'>;
