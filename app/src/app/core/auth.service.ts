import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthResponse, Session, User } from './auth.models';
import { SessionStorage } from './session-storage';

interface Message {
  message: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(SessionStorage);
  private readonly router = inject(Router);
  private readonly api = `${environment.apiUrl}/api/auth`;

  private session: Session | null = null;
  private refreshing: Promise<boolean> | null = null;
  private readonly currentUser = signal<User | null>(null);

  readonly user = this.currentUser.asReadonly();
  readonly isSignedIn = computed(() => this.currentUser() !== null);

  /** Access token for the Authorization header, or null when signed out. */
  get accessToken(): string | null {
    return this.session?.accessToken ?? null;
  }

  /** True for the sign-in endpoints, which must be called without a token and never trigger a refresh. */
  isPublicUrl(url: string): boolean {
    return url.startsWith(`${this.api}/`) && url !== `${this.api}/me`;
  }

  /** Restores the saved session at startup, then checks it with the server in the background. */
  async init(): Promise<void> {
    this.session = await this.storage.load();
    this.currentUser.set(this.session?.user ?? null);
    if (this.session) void this.reloadUser();
  }

  async login(email: string, password: string): Promise<void> {
    await this.start(await firstValueFrom(this.http.post<AuthResponse>(`${this.api}/login`, { email, password })));
  }

  register(email: string, password: string, fullName: string): Promise<Message> {
    return firstValueFrom(this.http.post<Message>(`${this.api}/register`, { email, password, fullName }));
  }

  confirmEmail(userId: string, token: string): Promise<Message> {
    return firstValueFrom(this.http.post<Message>(`${this.api}/confirm-email`, { userId, token }));
  }

  resendConfirmation(email: string): Promise<Message> {
    return firstValueFrom(this.http.post<Message>(`${this.api}/resend-confirmation`, { email }));
  }

  forgotPassword(email: string): Promise<Message> {
    return firstValueFrom(this.http.post<Message>(`${this.api}/forgot-password`, { email }));
  }

  resetPassword(userId: string, token: string, newPassword: string): Promise<Message> {
    return firstValueFrom(this.http.post<Message>(`${this.api}/reset-password`, { userId, token, newPassword }));
  }

  async logout(): Promise<void> {
    const refreshToken = this.session?.refreshToken;
    await this.end();
    if (refreshToken) {
      // Best effort: the local session is already gone even if the server cannot be reached.
      await firstValueFrom(this.http.post(`${this.api}/logout`, { refreshToken })).catch(() => undefined);
    }
    await this.router.navigateByUrl('/login');
  }

  /**
   * Gets a new access token. Returns false when the session is over (the user is sent to sign in)
   * or the server cannot be reached. Calls made at the same time share one request.
   */
  refresh(): Promise<boolean> {
    this.refreshing ??= this.withCrossTabLock(() => this.doRefresh()).finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private async doRefresh(): Promise<boolean> {
    // Another browser tab may have refreshed already. Each refresh token works once, so use the newer one.
    const stored = await this.storage.load();
    if (!stored) {
      await this.end();
      return false;
    }
    if (stored.refreshToken !== this.session?.refreshToken) {
      this.session = stored;
      this.currentUser.set(stored.user);
      return true;
    }

    try {
      const response = await firstValueFrom(
        this.http.post<AuthResponse>(`${this.api}/refresh`, { refreshToken: stored.refreshToken }),
      );
      await this.start(response);
      return true;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        await this.end();
        await this.router.navigateByUrl('/login');
      }
      return false;
    }
  }

  private async reloadUser(): Promise<void> {
    try {
      const user = await firstValueFrom(this.http.get<User>(`${this.api}/me`));
      if (this.session) {
        this.session = { ...this.session, user };
        this.currentUser.set(user);
        await this.storage.save(this.session);
      }
    } catch {
      // Offline, or the session ended (the interceptor has already handled that).
    }
  }

  private async start(response: AuthResponse): Promise<void> {
    this.session = {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      user: response.user,
    };
    await this.storage.save(this.session);
    this.currentUser.set(response.user);
  }

  private async end(): Promise<void> {
    this.session = null;
    this.currentUser.set(null);
    await this.storage.clear();
  }

  /** Stops two browser tabs from spending the same refresh token at the same moment. */
  private withCrossTabLock<T>(work: () => Promise<T>): Promise<T> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    return locks ? locks.request('smallmart.refresh', work) : work();
  }
}
