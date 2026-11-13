import { signal } from '@angular/core';
import { toApiError } from './api-error';
import { Page } from './admin.service';

/** A list loaded one page at a time with a "Load more" button. */
export class PagedList<T> {
  readonly items = signal<T[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');
  private latest = 0;

  constructor(
    private readonly fetch: (skip: number, take: number) => Promise<Page<T>>,
    private readonly pageSize = 25,
  ) {}

  get hasMore(): boolean {
    return this.items().length < this.total();
  }

  /** Loads the first page again, for example after a filter changed. */
  reload(): Promise<void> {
    return this.load(0);
  }

  more(): Promise<void> {
    return this.load(this.items().length);
  }

  /** Swaps one row for its updated version without reloading. */
  replace(match: (item: T) => boolean, updated: T): void {
    this.items.update((list) => list.map((item) => (match(item) ? updated : item)));
  }

  private async load(skip: number): Promise<void> {
    // Fast typing starts several loads; only the newest may be shown.
    const request = ++this.latest;
    this.loading.set(true);
    this.error.set('');
    try {
      const page = await this.fetch(skip, this.pageSize);
      if (request !== this.latest) return;
      this.items.set(skip === 0 ? page.items : [...this.items(), ...page.items]);
      this.total.set(page.total);
    } catch (e) {
      if (request === this.latest) this.error.set(toApiError(e).message);
    } finally {
      if (request === this.latest) this.loading.set(false);
    }
  }
}
