export interface StoreShop {
  id: string;
  name: string;
  description: string | null;
  addressLine: string;
  city: string;
  pincode: string;
  phone: string;
  isOpen: boolean;
  acceptsUpi: boolean;
  deliveryFee: number;
  minimumOrder: number;
  logoUrl: string | null;
}

export interface StoreCategory {
  id: string;
  name: string;
}

export interface StoreItem {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  price: number;
  mrp: number | null;
  unit: string;
  imageUrl: string | null;
  /** How many can be ordered, or null when the shop does not count stock for this item. */
  available: number | null;
}

export interface StoreShopDetail {
  shop: StoreShop;
  categories: StoreCategory[];
}

export type OrderStatus = 'Placed' | 'Accepted' | 'Packed' | 'OutForDelivery' | 'Delivered' | 'Cancelled';
export type PaymentMethod = 'CashOnDelivery' | 'Upi';
export type PaymentStatus = 'Pending' | 'AwaitingVerification' | 'Paid' | 'Rejected';

export interface OrderSummary {
  id: string;
  number: string;
  shopId: string;
  shopName: string;
  customerName: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  total: number;
  itemCount: number;
  createdAt: string;
}

export interface OrderLine {
  itemId: string | null;
  name: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  number: string;
  shopId: string;
  shopName: string;
  shopPhone: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  subtotal: number;
  deliveryFee: number;
  total: number;
  customerName: string;
  phone: string;
  addressLine: string;
  city: string;
  pincode: string;
  note: string | null;
  cancelReason: string | null;
  upi: { upiId: string; payeeName: string; amount: number; payUri: string } | null;
  upiReference: string | null;
  hasUpiProof: boolean;
  upiSubmittedAt: string | null;
  paymentRejectReason: string | null;
  paymentVerifiedAt: string | null;
  createdAt: string;
  items: OrderLine[];
  events: { at: string; title: string; note: string | null }[];
}

export interface DeliveryAddress {
  customerName: string;
  phone: string;
  addressLine: string;
  city: string;
  pincode: string;
}

export interface PlaceOrderInput extends DeliveryAddress {
  shopId: string;
  items: { itemId: string; quantity: number }[];
  paymentMethod: PaymentMethod;
  note: string | null;
  expectedTotal: number;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  Placed: 'Waiting for the shop',
  Accepted: 'Accepted',
  Packed: 'Packed',
  OutForDelivery: 'Out for delivery',
  Delivered: 'Delivered',
  Cancelled: 'Cancelled',
};

export function statusLabel(status: OrderStatus): string {
  return STATUS_LABELS[status];
}

export function statusColor(status: OrderStatus): string {
  return status === 'Delivered' ? 'success' : status === 'Cancelled' ? 'danger' : status === 'Placed' ? 'warning' : 'primary';
}

export function paymentLabel(order: Pick<Order, 'paymentMethod' | 'paymentStatus'>): string {
  if (order.paymentMethod === 'CashOnDelivery') return order.paymentStatus === 'Paid' ? 'Paid in cash' : 'Cash on delivery';
  switch (order.paymentStatus) {
    case 'Paid':
      return 'Paid by UPI';
    case 'AwaitingVerification':
      return 'UPI payment being checked';
    case 'Rejected':
      return 'UPI payment not found';
    default:
      return 'UPI payment pending';
  }
}

export function paymentColor(order: Pick<Order, 'paymentMethod' | 'paymentStatus'>): string {
  if (order.paymentStatus === 'Paid') return 'success';
  if (order.paymentStatus === 'Rejected') return 'danger';
  return order.paymentMethod === 'Upi' ? 'warning' : 'medium';
}
