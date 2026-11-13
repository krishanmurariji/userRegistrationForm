import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { DeliveryAddress, Order, OrderSummary, PlaceOrderInput, StoreCategoryTile, StoreItem, StoreSearchResult, StoreShop, StoreShopDetail } from './store.models';

/** What customers do: browse shops, place orders, pay and follow them. */
@Injectable({ providedIn: 'root' })
export class StoreService {
  private readonly http = inject(HttpClient);
  private readonly store = `${environment.apiUrl}/api/store`;
  private readonly orders = `${environment.apiUrl}/api/orders`;

  shops(search = ''): Promise<StoreShop[]> {
    const params = search.trim() ? new HttpParams().set('search', search.trim()) : undefined;
    return firstValueFrom(this.http.get<StoreShop[]>(`${this.store}/shops`, { params }));
  }

  /** Category names across all shops, for the home page tiles. */
  categories(): Promise<StoreCategoryTile[]> {
    return firstValueFrom(this.http.get<StoreCategoryTile[]>(`${this.store}/categories`));
  }

  /** Items across all shops, by name or by category name, plus matching shops. */
  search(query: { search?: string; category?: string }): Promise<StoreSearchResult> {
    let params = new HttpParams();
    if (query.search?.trim()) params = params.set('search', query.search.trim());
    if (query.category?.trim()) params = params.set('category', query.category.trim());
    return firstValueFrom(this.http.get<StoreSearchResult>(`${this.store}/search`, { params }));
  }

  shop(id: string): Promise<StoreShopDetail> {
    return firstValueFrom(this.http.get<StoreShopDetail>(`${this.store}/shops/${id}`));
  }

  items(shopId: string, filter: { categoryId?: string | null; search?: string } = {}): Promise<StoreItem[]> {
    let params = new HttpParams();
    if (filter.categoryId) params = params.set('categoryId', filter.categoryId);
    if (filter.search?.trim()) params = params.set('search', filter.search.trim());
    return firstValueFrom(this.http.get<StoreItem[]>(`${this.store}/shops/${shopId}/items`, { params }));
  }

  placeOrder(input: PlaceOrderInput): Promise<Order> {
    return firstValueFrom(this.http.post<Order>(this.orders, input));
  }

  myOrders(): Promise<OrderSummary[]> {
    return firstValueFrom(this.http.get<OrderSummary[]>(`${this.orders}/mine`));
  }

  order(id: string): Promise<Order> {
    return firstValueFrom(this.http.get<Order>(`${this.orders}/${id}`));
  }

  /** Delivery details of the latest order, or null for a first-time customer. */
  lastAddress(): Promise<DeliveryAddress | null> {
    return firstValueFrom(this.http.get<DeliveryAddress | null>(`${this.orders}/last-address`));
  }

  cancelOrder(id: string): Promise<Order> {
    return firstValueFrom(this.http.post<Order>(`${this.orders}/${id}/cancel`, null));
  }

  submitUpiProof(id: string, reference: string, screenshot: File): Promise<Order> {
    const data = new FormData();
    data.append('reference', reference);
    data.append('file', screenshot);
    return firstValueFrom(this.http.post<Order>(`${this.orders}/${id}/upi-proof`, data));
  }
}
