import { Component, OnDestroy, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonCheckbox, IonContent, IonHeader, IonInput, IonSpinner, IonText, IonTitle, IonToggle, IonToolbar, NavController } from '@ionic/angular';
import { toApiError } from '../core/api-error';
import { Category, ScanField, ScanProduct, ScanStatus } from '../core/shop.models';
import { ShopService } from '../core/shop.service';

type Key = 'name' | 'category' | 'unit' | 'mrp' | 'barcode';

/** A draft item on screen: what was read, what the owner has typed over it, and how each field should be labelled. */
interface Draft {
  include: boolean;
  name: string;
  category: string;
  unit: string;
  price: string;
  mrp: string;
  barcode: string;
  description: string | null;
  /** Fields the owner has not touched since the scan, so the "where it came from" note still applies. */
  untouched: Set<Key>;
  read: ScanProduct;
  error: string;
}

const SOURCES: Record<string, string> = {
  photo: 'Read from the photo',
  barcode: 'From the barcode',
  catalog: 'Saved earlier by a shop',
  web: 'Found on the web',
};

/** Add items by photographing them: the photo is read into drafts, the owner checks them and sets prices. */
@Component({
  selector: 'app-item-scan',
  imports: [IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonInput, IonCheckbox, IonToggle, IonButton, IonSpinner, IonText],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button [defaultHref]="'/shops/' + shopId" /></ion-buttons>
        <ion-title>Add from a photo</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <main class="page-column">
        @if (status(); as st) {
          @if (!st.enabled) {
            <div class="notice" role="status">
              <strong>Reading items from photos is not set up yet.</strong>
              The platform admin needs to add an AI key on the server. You can still add items by hand or with quick add.
            </div>
          } @else {
            @if (drafts().length === 0) {
              <h1>Take a photo of the product</h1>
              <ul class="tips">
                <li>One product, close up, with the front label readable, works best.</li>
                <li>If the barcode is in the photo, the details are more reliable.</li>
                <li>A photo of a shelf adds several items at once.</li>
              </ul>
              <div class="scan-photo">
                @if (preview(); as src) { <img [src]="src" alt="The photo you chose" /> } @else { <span>No photo yet</span> }
              </div>
              <ion-button expand="block" fill="outline" [disabled]="busy()" (click)="picker.click()">
                {{ photo() ? 'Choose a different photo' : 'Take or choose a photo' }}
              </ion-button>
              <input #picker type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden (change)="pick($event)" />
              <ion-button expand="block" [disabled]="busy() || !photo() || st.remainingToday === 0" (click)="scan()">
                @if (busy()) { <ion-spinner name="crescent" aria-label="Reading the photo" /> } @else { Read details }
              </ion-button>
              @if (busy()) { <p class="meta" role="status">Reading the photo. This can take up to half a minute.</p> }
              <p class="meta">
                {{ st.remainingToday }} of {{ st.dailyLimit }} photo scans left today.
                @if (st.remainingToday === 0) { You can add items by hand, or scan again tomorrow. }
              </p>
              @if (nothingFound()) {
                <div class="notice" role="status"><strong>No products were recognised in that photo.</strong>Try a closer, sharper photo with the label facing the camera.</div>
              }
            } @else {
              <h1>Check {{ drafts().length === 1 ? 'this item' : 'these ' + drafts().length + ' items' }}</h1>
              <p class="meta">
                Fields marked "Please check" are guesses. Type the price you sell at; it is never filled in for you.
              </p>
              @for (d of drafts(); track $index; let i = $index) {
                <section class="panel draft" [class.off]="!d.include">
                  <ion-checkbox [checked]="d.include" labelPlacement="end" justify="start" (ionChange)="patch(i, { include: $event.detail.checked })">
                    Add this item
                  </ion-checkbox>
                  @if (d.include) {
                    <ion-input label="Item name" labelPlacement="stacked" fill="outline" [value]="d.name" maxlength="150"
                      [class.review]="review(d, 'name')" [helperText]="note(d, 'name')" (ionInput)="type(i, 'name', $event.detail.value)" />
                    <div class="two-columns">
                      <ion-input label="Your price (₹)" labelPlacement="stacked" fill="outline" type="number" inputmode="decimal" min="0" step="0.01"
                        [value]="d.price" helperText="You decide this" (ionInput)="patch(i, { price: $event.detail.value ?? '' })" />
                      <ion-input label="MRP (₹)" labelPlacement="stacked" fill="outline" type="number" inputmode="decimal" min="0" step="0.01"
                        [value]="d.mrp" [class.review]="review(d, 'mrp')" [helperText]="note(d, 'mrp')" (ionInput)="type(i, 'mrp', $event.detail.value)" />
                    </div>
                    <div class="two-columns">
                      <ion-input label="Unit" labelPlacement="stacked" fill="outline" [value]="d.unit" maxlength="30" placeholder="500 g, 1 kg"
                        [class.review]="review(d, 'unit')" [helperText]="note(d, 'unit')" (ionInput)="type(i, 'unit', $event.detail.value)" />
                      <ion-input label="Category" labelPlacement="stacked" fill="outline" [value]="d.category" maxlength="80"
                        [attr.list]="'scan-categories'" [class.review]="review(d, 'category')" [helperText]="note(d, 'category')"
                        (ionInput)="type(i, 'category', $event.detail.value)" />
                    </div>
                    <ion-input label="Barcode" labelPlacement="stacked" fill="outline" inputmode="numeric" [value]="d.barcode" maxlength="64"
                      [class.review]="review(d, 'barcode')" [helperText]="note(d, 'barcode')" (ionInput)="type(i, 'barcode', $event.detail.value)" />
                    @if (d.error) {
                      <ion-text color="danger" role="alert"><p class="message">{{ d.error }}</p></ion-text>
                    }
                  }
                </section>
              }
              <datalist id="scan-categories">
                @for (c of categories(); track c.id) { <option [value]="c.name"></option> }
              </datalist>

              @if (drafts().length === 1) {
                <ion-toggle [checked]="usePhoto()" (ionChange)="usePhoto.set($event.detail.checked)">Use this photo as the item's picture</ion-toggle>
              } @else {
                <p class="meta">A shelf photo is not used as the item pictures. Open each item later to add its own photo.</p>
              }
              @if (error(); as message) {
                <ion-text color="danger" role="alert"><p class="message">{{ message }}</p></ion-text>
              }
              <ion-button expand="block" [disabled]="busy() || included() === 0" (click)="save()">
                @if (busy()) { <ion-spinner name="crescent" aria-label="Adding items" /> }
                @else { Add {{ included() }} {{ included() === 1 ? 'item' : 'items' }} }
              </ion-button>
              <ion-button expand="block" fill="clear" [disabled]="busy()" (click)="reset()">Discard and scan another photo</ion-button>
            }
          }
          @if (added(); as count) {
            <ion-text color="success" role="status"><p>{{ count }} {{ count === 1 ? 'item' : 'items' }} added to your shop.</p></ion-text>
          }
        } @else if (error(); as message) {
          <ion-text color="danger" role="alert"><p>{{ message }}</p></ion-text>
        } @else {
          <div class="centered"><ion-spinner name="crescent" aria-label="Loading" /></div>
        }
      </main>
    </ion-content>
  `,
})
export class ItemScanPage implements OnDestroy {
  private readonly shops = inject(ShopService);
  private readonly nav = inject(NavController);

  protected readonly shopId = inject(ActivatedRoute).snapshot.paramMap.get('shopId')!;
  protected readonly status = signal<ScanStatus | null>(null);
  protected readonly categories = signal<Category[]>([]);
  protected readonly photo = signal<File | null>(null);
  protected readonly preview = signal<string | null>(null);
  protected readonly drafts = signal<Draft[]>([]);
  protected readonly usePhoto = signal(true);
  protected readonly nothingFound = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly added = signal(0);

  protected included(): number {
    return this.drafts().filter((d) => d.include).length;
  }

  async ionViewWillEnter(): Promise<void> {
    try {
      const [status, categories] = await Promise.all([this.shops.scanStatus(this.shopId), this.shops.categories(this.shopId)]);
      this.status.set(status);
      this.categories.set(categories);
    } catch (e) {
      this.error.set(toApiError(e).message);
    }
  }

  ngOnDestroy(): void {
    this.releasePreview();
  }

  protected pick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set('');
    this.nothingFound.set(false);
    if (file.size > 5 * 1024 * 1024) {
      this.error.set('The photo is larger than 5 MB. Please choose a smaller one.');
      return;
    }
    this.releasePreview();
    this.photo.set(file);
    this.preview.set(URL.createObjectURL(file));
  }

  protected async scan(): Promise<void> {
    const photo = this.photo();
    if (!photo || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.nothingFound.set(false);
    this.added.set(0);
    try {
      const result = await this.shops.scanPhoto(this.shopId, photo);
      this.status.update((st) => st && { ...st, remainingToday: result.remainingToday });
      this.usePhoto.set(result.products.length === 1);
      this.drafts.set(result.products.map((read) => this.toDraft(read)));
      this.nothingFound.set(result.products.length === 0);
    } catch (e) {
      this.error.set(toApiError(e).message);
      void this.shops.scanStatus(this.shopId).then((st) => this.status.set(st)).catch(() => undefined);
    } finally {
      this.busy.set(false);
    }
  }

  private toDraft(read: ScanProduct): Draft {
    // The brand goes in front of the name unless the name already has it.
    const name = read.name.value ?? '';
    const brand = read.brand.value ?? '';
    return {
      include: true,
      name: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${name}`.trim() : name,
      category: read.category.value ?? '',
      unit: read.unit.value ?? '',
      price: '',
      mrp: read.mrp.value === null ? '' : String(read.mrp.value),
      barcode: read.barcode.value ?? '',
      description: read.description.value,
      untouched: new Set<Key>(['name', 'category', 'unit', 'mrp', 'barcode']),
      read,
      error: '',
    };
  }

  /** The small line under a field: where the value came from, or a prompt to fill or check it. */
  protected note(draft: Draft, key: Key): string {
    if (!draft.untouched.has(key)) return '';
    const field: ScanField<unknown> = draft.read[key];
    if (field.value === null) return key === 'barcode' || key === 'mrp' ? 'Not readable in the photo' : 'Not found: please fill in';
    const source = SOURCES[field.source ?? ''] ?? '';
    return field.needsReview ? `Please check · ${source}` : source;
  }

  protected review(draft: Draft, key: Key): boolean {
    const field: ScanField<unknown> = draft.read[key];
    return draft.untouched.has(key) && field.needsReview && (field.value !== null || key === 'name' || key === 'unit');
  }

  /** The owner typed in a field: keep the text and stop showing the scan's note for it. */
  protected type(index: number, key: Key, value: string | number | null | undefined): void {
    this.drafts.update((list) =>
      list.map((d, i) => {
        if (i !== index) return d;
        const untouched = new Set(d.untouched);
        untouched.delete(key);
        return { ...d, [key]: String(value ?? ''), untouched, error: '' };
      }),
    );
  }

  protected patch(index: number, change: Partial<Draft>): void {
    this.drafts.update((list) => list.map((d, i) => (i === index ? { ...d, ...change, error: '' } : d)));
  }

  protected async save(): Promise<void> {
    if (this.busy()) return;
    // Check everything first, so either all chosen drafts are attempted or none.
    let invalid = false;
    this.drafts.update((list) =>
      list.map((d) => {
        if (!d.include) return d;
        const price = Number(d.price);
        const mrp = d.mrp === '' ? null : Number(d.mrp);
        const error = !d.name.trim() ? 'Enter the item name.'
          : !d.unit.trim() ? 'Enter the unit, for example 500 g.'
          : !(price > 0) ? 'Enter the price you sell this at.'
          : mrp !== null && !(mrp > 0) ? 'The MRP must be above 0, or leave it empty.'
          : mrp !== null && mrp < price ? 'The price cannot be higher than the MRP.'
          : '';
        invalid ||= !!error;
        return { ...d, error };
      }),
    );
    if (invalid) {
      this.error.set('Some items need attention before they can be added.');
      return;
    }

    this.busy.set(true);
    this.error.set('');
    const photo = this.usePhoto() && this.drafts().length === 1 ? this.photo() : null;
    const left: Draft[] = [];
    let added = 0;
    for (const draft of this.drafts()) {
      if (!draft.include) continue;
      try {
        const item = await this.shops.createItem(this.shopId, {
          name: draft.name.trim(),
          categoryId: null,
          newCategoryName: draft.category.trim() || null,
          price: Number(draft.price),
          mrp: draft.mrp === '' ? null : Number(draft.mrp),
          unit: draft.unit.trim(),
          barcode: draft.barcode.trim() || null,
          description: draft.description,
          isActive: true,
          trackStock: false,
          lowStockThreshold: 5,
          openingStock: null,
        });
        added++;
        // The item exists now; a photo that fails to upload can be added later from the item page.
        if (photo) await this.shops.uploadItemImage(this.shopId, item.id, photo).catch(() => undefined);
      } catch (e) {
        left.push({ ...draft, error: toApiError(e).message });
      }
    }
    this.busy.set(false);
    this.added.set(added);

    if (left.length) {
      // Keep only what failed on screen, so retrying cannot add the others twice.
      this.drafts.set(left);
      this.error.set(`${left.length} ${left.length === 1 ? 'item was' : 'items were'} not added. See the message on each.`);
      return;
    }
    await this.nav.navigateBack(['/shops', this.shopId]);
  }

  protected reset(): void {
    this.drafts.set([]);
    this.photo.set(null);
    this.releasePreview();
    this.error.set('');
    this.nothingFound.set(false);
  }

  private releasePreview(): void {
    const url = this.preview();
    if (url) URL.revokeObjectURL(url);
    this.preview.set(null);
  }
}
