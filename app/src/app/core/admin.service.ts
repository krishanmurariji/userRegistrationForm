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

  private params(query: Query): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined && value !== '') params = params.set(key, value);
    }
    return params;
  }
}
