import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface AppNotification {
  id: number;
  title: string;
  body: string;
  /** The page in the app this is about. */
  link: string | null;
  createdAt: string;
  read: boolean;
}

const POLL_MS = 30_000;

/** The signed-in user's notifications. The unread number is refreshed every 30 seconds while the app is open. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly api = `${environment.apiUrl}/api/notifications`;
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly unread = signal(0);

  constructor() {
    // Start watching when someone signs in, stop when they sign out.
    effect(() => {
      const signedIn = this.auth.isSignedIn();
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      if (!signedIn) {
        this.unread.set(0);
        return;
      }
      void this.refreshUnread();
      this.timer = setInterval(() => !document.hidden && void this.refreshUnread(), POLL_MS);
    });
  }

  async refreshUnread(): Promise<void> {
    try {
      const { unread } = await firstValueFrom(this.http.get<{ unread: number }>(`${this.api}/unread-count`));
      this.unread.set(unread);
    } catch {
      // Offline or signed out: keep the last number.
    }
  }

  async list(): Promise<AppNotification[]> {
    const result = await firstValueFrom(this.http.get<{ items: AppNotification[]; unread: number }>(this.api));
    this.unread.set(result.unread);
    return result.items;
  }

  async markRead(id: number): Promise<void> {
    await firstValueFrom(this.http.post(`${this.api}/${id}/read`, null));
    this.unread.update((n) => Math.max(0, n - 1));
  }

  async markAllRead(): Promise<void> {
    await firstValueFrom(this.http.post(`${this.api}/read-all`, null));
    this.unread.set(0);
  }
}
