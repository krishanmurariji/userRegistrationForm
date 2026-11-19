import { Component, inject, signal } from '@angular/core';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { Capacitor } from '@capacitor/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AppIcon } from './icon';
import { isDesktopApp } from './platform';

const LATEST = 'https://api.github.com/repos/krishanmurariji/SmallMart/releases/latest';
const SKIP_KEY = 'smallmart.skipVersion';

/** "1.0.10" > "1.0.9". Anything that is not a plain version counts as 0. */
export function isNewer(latest: string, current: string): boolean {
  const parts = (v: string) => v.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const a = parts(latest);
  const b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

/**
 * Apps installed from the website do not update themselves, so the Android and Windows apps check GitHub for a newer
 * release when they start and offer a one-tap download.
 */
@Component({
  selector: 'app-update-banner',
  imports: [AppIcon],
  template: `
    @if (latest(); as version) {
      <div class="update-banner" role="status" animate.enter="oa-pill-in">
        <span class="ub-icon"><app-icon name="arrow-clockwise" /></span>
        <span class="ub-text"><strong>Small Mart {{ version }} is available</strong><small>You have {{ current }}. Get the latest fixes and features.</small></span>
        <button type="button" class="ub-later" (click)="later(version)">Later</button>
        <a class="ub-go" [href]="downloadUrl" target="_blank" rel="noopener" (click)="dismiss()">Update</a>
      </div>
    }
  `,
})
export class UpdateBanner {
  // A bare HttpClient: no sign-in token is sent to GitHub.
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly platform = isDesktopApp ? 'windows' : Capacitor.getPlatform();
  protected readonly current = environment.appVersion;
  protected readonly latest = signal<string | null>(null);
  protected readonly downloadUrl =
    `${environment.downloadsUrl}/${this.platform === 'windows' ? 'SmallMart-Windows-Setup.exe' : 'SmallMart-Android.apk'}`;

  constructor() {
    if (this.current === 'dev' || (this.platform !== 'android' && this.platform !== 'windows')) return;
    void this.check();
  }

  private async check(): Promise<void> {
    try {
      const release = await firstValueFrom(this.http.get<{ tag_name: string; draft: boolean; prerelease: boolean }>(LATEST));
      const version = release.tag_name.replace(/^v/i, '');
      if (release.draft || release.prerelease || !isNewer(version, this.current)) return;
      if (readSkip() === version) return;
      this.latest.set(version);
    } catch {
      // Offline or GitHub unreachable: try again next time the app starts.
    }
  }

  protected later(version: string): void {
    try {
      localStorage.setItem(SKIP_KEY, version);
    } catch {
      // Private storage unavailable: the banner just comes back next start.
    }
    this.dismiss();
  }

  protected dismiss(): void {
    this.latest.set(null);
  }
}

function readSkip(): string | null {
  try {
    return localStorage.getItem(SKIP_KEY);
  } catch {
    return null;
  }
}
