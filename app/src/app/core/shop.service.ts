import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Category, Item, ItemInput, Shop, ShopInput, StockMovement } from './shop.models';
import { Order, OrderStatus, OrderSummary } from './store.models';

/** Full address of a picture path returned by the API, or null when there is no picture. */
export function fileUrl(path: string | null | undefined): string | null {
  return path ? `${environment.apiUrl}${path}` : null;
}

/** Shop management calls for owners and staff. */
@Injectable({ providedIn: 'root' })
export class ShopService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/api/shops`;

  myShops(): Promise<Shop[]> {
    return firstValueFrom(this.http.get<Shop[]>(`${this.api}/mine`));
  }

  shop(id: string): Promise<Shop> {
    return firstValueFrom(this.http.get<Shop>(`${this.api}/${id}`));
  }

  createShop(input: ShopInput): Promise<Shop> {
    return firstValueFrom(this.http.post<Shop>(this.api, input));
  }

  updateShop(id: string, input: ShopInput): Promise<Shop> {
    return firstValueFrom(this.http.put<Shop>(`${this.api}/${id}`, input));
  }

  uploadLogo(id: string, file: File): Promise<Shop> {
    return firstValueFrom(this.http.post<Shop>(`${this.api}/${id}/logo`, this.form(file)));
  }

  categories(shopId: string): Promise<Category[]> {
    return firstValueFrom(this.http.get<Category[]>(`${this.api}/${shopId}/categories`));
  }

  createCategory(shopId: string, name: string, sortOrder: number): Promise<Category> {
    return firstValueFrom(this.http.post<Category>(`${this.api}/${shopId}/categories`, { name, sortOrder }));
  }

  updateCategory(shopId: string, id: string, name: string, sortOrder: number): Promise<Category> {
    return firstValueFrom(this.http.put<Category>(`${this.api}/${shopId}/categories/${id}`, { name, sortOrder }));
  }

  deleteCategory(shopId: string, id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.api}/${shopId}/categories/${id}`));
  }

  items(shopId: string, filter: { categoryId?: string | null; search?: string; stock?: 'low' | null } = {}): Promise<Item[]> {
    let params = new HttpParams().set('take', 200);
    if (filter.stock) params = params.set('stock', filter.stock);
    if (filter.categoryId) params = params.set('categoryId', filter.categoryId);
    if (filter.search?.trim()) params = params.set('search', filter.search.trim());
    return firstValueFrom(this.http.get<Item[]>(`${this.api}/${shopId}/items`, { params }));
  }

  item(shopId: string, id: string): Promise<Item> {
    return firstValueFrom(this.http.get<Item>(`${this.api}/${shopId}/items/${id}`));
  }

  createItem(shopId: string, input: ItemInput): Promise<Item> {
    return firstValueFrom(this.http.post<Item>(`${this.api}/${shopId}/items`, input));
  }

  updateItem(shopId: string, id: string, input: ItemInput): Promise<Item> {
    return firstValueFrom(this.http.put<Item>(`${this.api}/${shopId}/items/${id}`, input));
  }

  deleteItem(shopId: string, id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.api}/${shopId}/items/${id}`));
  }

  uploadItemImage(shopId: string, id: string, file: File): Promise<Item> {
    return firstValueFrom(this.http.post<Item>(`${this.api}/${shopId}/items/${id}/image`, this.form(file)));
  }

  // ----- Stock -----

  stockSummary(shopId: string): Promise<{ low: number; out: number }> {
    return firstValueFrom(this.http.get<{ low: number; out: number }>(`${this.api}/${shopId}/items/stock-summary`));
  }

  stockHistory(shopId: string, itemId: string): Promise<StockMovement[]> {
    return firstValueFrom(this.http.get<StockMovement[]>(`${this.api}/${shopId}/items/${itemId}/stock`));
  }

  /** Give either `change` (add or remove this many) or `setTo` (the counted number). */
  adjustStock(
    shopId: string, itemId: string,
    adjustment: { change?: number; setTo?: number; reason: 'Restock' | 'Damage' | 'Correction'; note: string | null },
  ): Promise<Item> {
    return firstValueFrom(this.http.post<Item>(`${this.api}/${shopId}/items/${itemId}/stock`, adjustment));
  }

  // ----- Orders, as handled by the shop -----

  orders(shopId: string, view: string): Promise<OrderSummary[]> {
    const params = view ? new HttpParams().set('view', view) : undefined;
    return firstValueFrom(this.http.get<OrderSummary[]>(`${this.api}/${shopId}/orders`, { params }));
  }

  orderCounts(shopId: string): Promise<{ new: number; active: number; payments: number }> {
    return firstValueFrom(this.http.get<{ new: number; active: number; payments: number }>(`${this.api}/${shopId}/orders/counts`));
  }

  order(shopId: string, id: string): Promise<Order> {
    return firstValueFrom(this.http.get<Order>(`${this.api}/${shopId}/orders/${id}`));
  }

  /** The customer's payment screenshot. It is private, so it is fetched with the sign-in token, not by a plain link. */
  upiProof(shopId: string, id: string): Promise<Blob> {
    return firstValueFrom(this.http.get(`${this.api}/${shopId}/orders/${id}/upi-proof`, { responseType: 'blob' }));
  }

  advanceOrder(shopId: string, id: string, status: OrderStatus): Promise<Order> {
    return firstValueFrom(this.http.post<Order>(`${this.api}/${shopId}/orders/${id}/status`, { status }));
  }

  cancelOrder(shopId: string, id: string, reason: string): Promise<Order> {
    return firstValueFrom(this.http.post<Order>(`${this.api}/${shopId}/orders/${id}/cancel`, { reason }));
  }

  verifyPayment(shopId: string, id: string): Promise<Order> {
    return firstValueFrom(this.http.post<Order>(`${this.api}/${shopId}/orders/${id}/payment/verify`, null));
  }

  rejectPayment(shopId: string, id: string, reason: string): Promise<Order> {
    return firstValueFrom(this.http.post<Order>(`${this.api}/${shopId}/orders/${id}/payment/reject`, { reason }));
  }

  private form(file: File): FormData {
    const data = new FormData();
    data.append('file', file);
    return data;
  }
}
