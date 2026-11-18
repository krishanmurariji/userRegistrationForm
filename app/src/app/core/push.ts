import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { IncomingOrdersService } from './incoming-orders';

interface SmallMartPushPlugin {
  register(options: { apiUrl: string }): Promise<{ available: boolean; permission: boolean; token?: string }>;
  clear(options: { orderId: string }): Promise<void>;
  addListener(event: 'newOrder', handler: (data: Record<string, string>) => void): Promise<PluginListenerHandle>;
  addListener(event: 'open', handler: (data: { path: string }) => void): Promise<PluginListenerHandle>;
}

/** The Android part lives in android/app/src/main/java/com/smallmart/app/PushPlugin.java. */
const NativePush = registerPlugin<SmallMartPushPlugin>('SmallMartPush');

/**
 * Phone notifications for shop owners on Android: registers the phone with the server after sign-in, removes it on
 * sign-out, sends pushes that arrive while the app is open to the full-screen alert, and opens the order when a
 * notification is tapped.
 */
@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly incoming = inject(IncomingOrdersService);
  private readonly api = `${environment.apiUrl}/api/push`;
  private readonly enabled = Capacitor.getPlatform() === 'android';
  private token: string | null = null;

  constructor() {
    if (!this.enabled) return;
    void NativePush.addListener('newOrder', () => void this.incoming.refresh());
    void NativePush.addListener('open', ({ path }) => void this.router.navigateByUrl(path));
    effect(() => {
      if (this.auth.isShopOwner()) void this.register();
    });
    this.auth.beforeSignOut(() => this.unregister());
    this.incoming.handled = (orderId) => void NativePush.clear({ orderId }).catch(() => undefined);
  }

  private async register(): Promise<void> {
    try {
      const result = await NativePush.register({ apiUrl: environment.apiUrl });
      if (!result.token) return;
      this.token = result.token;
      await firstValueFrom(this.http.post(`${this.api}/devices`, { token: result.token, platform: 'android' }));
    } catch {
      // No Google Play services, or offline: the in-app alert still works while the app is open.
    }
  }

  private async unregister(): Promise<void> {
    if (!this.token) return;
    const token = this.token;
    this.token = null;
    await firstValueFrom(this.http.post(`${this.api}/devices/remove`, { token })).catch(() => undefined);
  }
}
