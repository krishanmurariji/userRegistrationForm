import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Page<T> {
  items: T[];
  total: number;
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  emailConfirmed: boolean;
  suspended: boolean;
  shopCount: number;
  createdAt: string;
}

export interface AdminShop {
  id: string;
  name: string;
  city: string;
  phone: string;
  isActive: boolean;
  isOpen: boolean;
  ownerEmail: string | null;
  ownerName: string | null;
  itemCount: number;
  createdAt: string;
}

export interface AdminStats {
  totalUsers: number;
  customers: number;
  shopOwners: number;
  suspendedUsers: number;
  newUsersLast7Days: number;
  activeShops: number;
  deactivatedShops: number;
  items: number;
  signInsLast24Hours: number;
  failedSignInsLast24Hours: number;
  orders: number;
  ordersLast24Hours: number;
  paymentsAwaitingVerification: number;
}

export interface AuditEntry {
  id: number;
  at: string;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  summary: string;
  ipAddress: string | null;
}

export interface AdminUserDetail {
  user: AdminUser;
  hasPassword: boolean;
  signInMethods: string[];
  shops: { id: string; name: string; city: string; isActive: boolean }[];
  orderCount: number;
  recentActivity: AuditEntry[];
}

export interface AdminShopDetail {
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
  isActive: boolean;
  isOpen: boolean;
  logoUrl: string | null;
  createdAt: string;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  categoryCount: number;
  itemCount: number;
  orderCount: number;
  openOrderCount: number;
  deliveredSales: number;
  recentActivity: AuditEntry[];
}

type Query = Record<string, string | number | boolean | null | undefined>;

/** Calls for the platform admin section. The API refuses them for everyone else. */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/api/admin`;

  stats(): Promise<AdminStats> {
    return firstValueFrom(this.http.get<AdminStats>(`${this.api}/stats`));
  }

  users(query: Query): Promise<Page<AdminUser>> {
    return firstValueFrom(this.http.get<Page<AdminUser>>(`${this.api}/users`, { params: this.params(query) }));
  }

  createShopOwner(email: string, fullName: string, password: string | null): Promise<AdminUser> {
    return firstValueFrom(this.http.post<AdminUser>(`${this.api}/users/shop-owners`, { email, fullName, password }));
  }

  makeShopOwner(id: string): Promise<AdminUser> {
    return firstValueFrom(this.http.post<AdminUser>(`${this.api}/users/${id}/shop-owner`, null));
  }

  removeShopOwner(id: string): Promise<AdminUser> {
    return firstValueFrom(this.http.delete<AdminUser>(`${this.api}/users/${id}/shop-owner`));
  }

  setSuspended(id: string, suspended: boolean): Promise<AdminUser> {
    return firstValueFrom(this.http.post<AdminUser>(`${this.api}/users/${id}/${suspended ? 'suspend' : 'unsuspend'}`, null));
  }

  shops(query: Query): Promise<Page<AdminShop>> {
    return firstValueFrom(this.http.get<Page<AdminShop>>(`${this.api}/shops`, { params: this.params(query) }));
  }

  setShopActive(id: string, active: boolean): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.api}/shops/${id}/${active ? 'activate' : 'deactivate'}`, null));
  }

  auditLogs(query: Query): Promise<Page<AuditEntry>> {
    return firstValueFrom(this.http.get<Page<AuditEntry>>(`${this.api}/audit-logs`, { params: this.params(query) }));
  }

  user(id: string): Promise<AdminUserDetail> {
    return firstValueFrom(this.http.get<AdminUserDetail>(`${this.api}/users/${id}`));
  }

  updateUser(id: string, fullName: string, email: string): Promise<AdminUserDetail> {
    return firstValueFrom(this.http.put<AdminUserDetail>(`${this.api}/users/${id}`, { fullName, email }));
  }

  sendPasswordReset(id: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.api}/users/${id}/send-password-reset`, null));
  }

  shop(id: string): Promise<AdminShopDetail> {
    return firstValueFrom(this.http.get<AdminShopDetail>(`${this.api}/shops/${id}`));
  }

  /** Downloads a CSV export ("users", "shops" or "audit-logs") and hands it to the browser to save. */
  async export(what: 'users' | 'shops' | 'audit-logs'): Promise<void> {
    const response = await firstValueFrom(
      this.http.get(`${this.api}/${what}/export`, { responseType: 'blob', observe: 'response' }),
    );
    const name = /filename="?([^";]+)"?/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? `smallmart-${what}.csv`;
    const url = URL.createObjectURL(response.body!);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  private params(query: Query): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined && value !== '') params = params.set(key, value);
    }
    return params;
  }
}
