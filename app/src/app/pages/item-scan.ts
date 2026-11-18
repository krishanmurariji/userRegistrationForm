import { Component, OnDestroy, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonCheckbox, IonContent, IonHeader, IonInput, IonSpinner, IonText, IonTextarea, IonTitle, IonToggle, IonToolbar, NavController } from '@ionic/angular';
import { PhotoEntry, PhotoPicker, photoFromFile, releasePhoto } from '../core/photo-picker';
import { toApiError } from '../core/api-error';
import { AppIcon } from '../core/icon';
import { SkeletonList } from '../core/skeletons';
import { Category, ScanField, ScanProduct, ScanStatus } from '../core/shop.models';
import { ShopService } from '../core/shop.service';

type Key = 'name' | 'category' | 'unit' | 'mrp' | 'barcode' | 'description';

/** A draft item on screen: what was read, what the owner has typed over it, and how each field should be labelled. */
interface Draft {
  include: boolean;
  name: string;
  category: string;
  unit: string;
  price: string;
  mrp: string;
  barcode: string;
  description: string;
  isActive: boolean;
  trackStock: boolean;
  openingStock: string;
  lowStock: string;
  /** The item's pictures: files chosen on screen, or ones already uploaded by an earlier try to save. At least one is needed. */
  photos: PhotoEntry[];
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
  imports: [AppIcon, SkeletonList, PhotoPicker, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonInput, IonTextarea, IonCheckbox, IonToggle, IonButton, IonSpinner, IonText],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button [defaultHref]="'/shops/' + shopId" text="" /></ion-buttons>
        <ion-title>Add from a photo</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="shop-bg">
      <main class="shop-column narrow owner-form owner-scan">
        @if (status(); as st) {
          @if (!st.enabled) {
            <div class="card closed-note" role="status">
              <strong>Reading items from photos is not set up yet.</strong>
              The platform admin needs to add an AI key on the server. You can still add items by hand or with quick add.
            </div>
          } @else {
            @if (drafts().length === 0) {
              <section class="scan-hero">
                <span class="ai-icon big"><app-icon name="sparkle" weight="duotone" /></span>
                <h1>Take a photo of the product</h1>
                <p>The name, size, MRP and category are filled in for you. You only add your price.</p>
              </section>
              <ul class="tips card">
                <li>One product, close up, with the front label readable, works best.</li>
                <li>If the barcode is in the photo, the details are more reliable.</li>
                <li>A photo of a shelf adds several items at once.</li>
              </ul>
              <button type="button" class="scan-photo" [disabled]="busy()" (click)="picker.click()" [class.has-photo]="!!preview()">
                @if (preview(); as src) { <img [src]="src" alt="The photo you chose" /> }
                @else { <app-icon name="camera" weight="duotone" /><span>Tap to take or choose a photo</span> }
                @if (busy()) { <span class="scan-line" aria-hidden="true"></span> }
              </button>
              <ion-button expand="block" fill="outline" [disabled]="busy()" (click)="picker.click()">
                {{ photo() ? 'Choose a different photo' : 'Take or choose a photo' }}
              </ion-button>
              <input #picker type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden (change)="pick($event)" />
              <ion-button expand="block" [disabled]="busy() || !photo() || st.remainingToday === 0" (click)="scan()">
                @if (busy()) { <ion-spinner name="crescent" aria-label="Reading the photo" /> } @else { Read details }
              </ion-button>
              @if (busy()) { <p class="meta" role="status">Reading the photo. This can take up to half a minute.</p> }
              <p class="meta center">
                <app-icon name="lightning" weight="duotone" /> {{ st.remainingToday }} of {{ st.dailyLimit }} photo scans left today.
                @if (st.remainingToday === 0) { You can add items by hand, or scan again tomorrow. }
              </p>
              @if (nothingFound()) {
                <div class="card closed-note" role="status"><strong>No products were recognised in that photo.</strong> Try a closer, sharper photo with the label facing the camera.</div>
              }
            } @else {
              <h1 class="page-title with-icon"><span class="head-icon"><app-icon name="check-circle" weight="duotone" /></span>Check {{ drafts().length === 1 ? 'this item' : 'these ' + drafts().length + ' items' }}</h1>
              <p class="meta">
                Fields marked "Please check" are guesses. Type the price you sell at, which is never filled in for you, and make sure every item has at least one picture.
              </p>
              @for (d of drafts(); track $index; let i = $index) {
                <section class="card draft stack" [class.off]="!d.include">
                  <ion-checkbox [checked]="d.include" labelPlacement="end" justify="start" (ionChange)="patch(i, { include: $event.detail.checked })">
                    Add this item
                  </ion-checkbox>
                  @if (d.include) {
                    <app-photo-picker label="Pictures" [photos]="d.photos" [busy]="busy()"
                      (add)="addPhotos(i, $event)" (remove)="removePhoto(i, $event)" (makeCover)="coverPhoto(i, $event)"
                      (problem)="patch(i, { error: $event })" />
                    <ion-input label="Item name" labelPlacement="stacked" fill="outline" [value]="d.name" maxlength="150"
                      [class.review]="review(d, 'name')" [helperText]="note(d, 'name')" (ionInput)="type(i, 'name', $event.detail.value)" />
                    <ion-input label="Category" labelPlacement="stacked" fill="outline" [value]="d.category" maxlength="80"
                      placeholder="Existing or new, for example Dairy" [attr.list]="'scan-categories'"
                      [class.review]="review(d, 'category')" [helperText]="note(d, 'category')" (ionInput)="type(i, 'category', $event.detail.value)" />
                    <div class="two-columns">
                      <ion-input label="Your price (₹)" labelPlacement="stacked" fill="outline" type="number" inputmode="decimal" min="0" step="0.01"
                        [value]="d.price" helperText="You decide this" (ionInput)="patch(i, { price: $event.detail.value ?? '' })" />
                      <ion-input label="MRP (₹, optional)" labelPlacement="stacked" fill="outline" type="number" inputmode="decimal" min="0" step="0.01"
                        [value]="d.mrp" [class.review]="review(d, 'mrp')" [helperText]="note(d, 'mrp')" (ionInput)="type(i, 'mrp', $event.detail.value)" />
                    </div>
                    <ion-input label="Unit" labelPlacement="stacked" fill="outline" [value]="d.unit" maxlength="30" placeholder="1 kg, 500 g, 1 piece"
                      [class.review]="review(d, 'unit')" [helperText]="note(d, 'unit')" (ionInput)="type(i, 'unit', $event.detail.value)" />
                    <ion-input label="Barcode (optional)" labelPlacement="stacked" fill="outline" inputmode="numeric" [value]="d.barcode" maxlength="64"
                      [class.review]="review(d, 'barcode')" [helperText]="note(d, 'barcode')" (ionInput)="type(i, 'barcode', $event.detail.value)" />
                    <ion-textarea label="Description (optional)" labelPlacement="stacked" fill="outline" [autoGrow]="true" [value]="d.description"
                      maxlength="2000" [class.review]="review(d, 'description')" [helperText]="note(d, 'description')"
                      (ionInput)="type(i, 'description', $event.detail.value)" />
                    <ion-toggle [checked]="d.isActive" (ionChange)="patch(i, { isActive: $event.detail.checked })">Visible to customers</ion-toggle>

                    <h3 class="draft-heading"><app-icon name="package" weight="duotone" />Stock</h3>
                    <ion-toggle [checked]="d.trackStock" (ionChange)="patch(i, { trackStock: $event.detail.checked })">Count stock for this item</ion-toggle>
                    @if (d.trackStock) {
                      <ion-input label="How many do you have now?" labelPlacement="stacked" fill="outline" type="number" inputmode="numeric" min="0" step="1"
                        [value]="d.openingStock" (ionInput)="patch(i, { openingStock: $event.detail.value ?? '' })" />
                      <ion-input label="Warn me when stock falls to" labelPlacement="stacked" fill="outline" type="number" inputmode="numeric" min="0" step="1"
                        [value]="d.lowStock" (ionInput)="patch(i, { lowStock: $event.detail.value ?? '' })" />
                    } @else {
                      <p class="meta">Off: the item is always shown as available.</p>
                    }
                    @if (d.error) {
                      <p role="alert" class="error-text">{{ d.error }}</p>
                    }
                  }
                </section>
              }
              <datalist id="scan-categories">
                @for (c of categories(); track c.id) { <option [value]="c.name"></option> }
              </datalist>

              @if (drafts().length === 1) {
                <p class="meta">The photo you took is the first picture. You can add up to four more.</p>
              } @else {
                <p class="meta">A shelf photo cannot be cut into pictures. Add at least one picture to each item above.</p>
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
            <div class="card ok-card" role="status"><app-icon name="check-circle" weight="fill" />{{ count }} {{ count === 1 ? 'item' : 'items' }} added to your shop.</div>
          }
        } @else if (error(); as message) {
          <ion-text color="danger" role="alert"><p>{{ message }}</p></ion-text>
        } @else {
          <app-skeleton-list [count]="2" />
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
    this.drafts().forEach((d) => d.photos.forEach(releasePhoto));
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
      this.drafts().forEach((d) => d.photos.forEach(releasePhoto));
      // A photo of one product becomes its first picture. A shelf photo cannot, so those drafts start without any.
      this.drafts.set(result.products.map((read) => this.toDraft(read, result.products.length === 1 ? [photoFromFile(photo)] : [])));
      this.nothingFound.set(result.products.length === 0);
    } catch (e) {
      this.error.set(toApiError(e).message);
      void this.shops.scanStatus(this.shopId).then((st) => this.status.set(st)).catch(() => undefined);
    } finally {
      this.busy.set(false);
    }
  }

  private toDraft(read: ScanProduct, photos: PhotoEntry[]): Draft {
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
      description: read.description.value ?? '',
      isActive: true,
      trackStock: false,
      openingStock: '',
      lowStock: '5',
      photos,
      untouched: new Set<Key>(['name', 'category', 'unit', 'mrp', 'barcode', 'description']),
      read,
      error: '',
    };
  }

  /** The small line under a field: where the value came from, or a prompt to fill or check it. */
  protected note(draft: Draft, key: Key): string {
    if (!draft.untouched.has(key)) return '';
    const field: ScanField<unknown> = draft.read[key];
    if (field.value === null) return key === 'barcode' || key === 'mrp' || key === 'description' ? 'Not readable in the photo' : 'Not found: please fill in';
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

  protected addPhotos(index: number, files: File[]): void {
    this.drafts.update((list) =>
      list.map((d, i) => (i === index ? { ...d, photos: [...d.photos, ...files.map(photoFromFile)], error: '' } : d)),
    );
  }

  protected removePhoto(index: number, entry: PhotoEntry): void {
    releasePhoto(entry);
    // It may already have been uploaded by an earlier attempt to save; do not leave it behind.
    if (entry.id) void this.shops.discardStagedImage(this.shopId, entry.id).catch(() => undefined);
    this.drafts.update((list) =>
      list.map((d, i) => (i === index ? { ...d, photos: d.photos.filter((p) => p.key !== entry.key), error: '' } : d)),
    );
  }

  protected coverPhoto(index: number, entry: PhotoEntry): void {
    this.drafts.update((list) =>
      list.map((d, i) => (i === index ? { ...d, photos: [entry, ...d.photos.filter((p) => p.key !== entry.key)], error: '' } : d)),
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
        const opening = d.openingStock === '' ? 0 : Number(d.openingStock);
        const warnAt = d.lowStock === '' ? NaN : Number(d.lowStock);
        const error = !d.name.trim() ? 'Enter the item name.'
          : !d.unit.trim() ? 'Enter the unit, for example 500 g.'
          : !(price > 0) ? 'Enter the price you sell this at.'
          : mrp !== null && !(mrp > 0) ? 'The MRP must be above 0, or leave it empty.'
          : mrp !== null && mrp < price ? 'The price cannot be higher than the MRP.'
          : d.photos.length === 0 ? 'Add at least one picture of the item.'
          : d.trackStock && !(Number.isInteger(opening) && opening >= 0) ? 'Enter how many you have, as a whole number.'
          : d.trackStock && !(Number.isInteger(warnAt) && warnAt >= 0) ? 'Enter the stock level to warn at, as a whole number.'
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
    const left: Draft[] = [];
    let added = 0;
    for (const draft of this.drafts()) {
      if (!draft.include) continue;
      const ready = [...draft.photos];
      try {
        // Upload the pictures first. One that already went up on an earlier try is not sent again.
        for (let index = 0; index < ready.length; index++) {
          if (!ready[index].id) ready[index] = { ...ready[index], id: (await this.shops.stageImage(this.shopId, ready[index].file!)).id };
        }
        await this.shops.createItem(this.shopId, {
          name: draft.name.trim(),
          categoryId: null,
          newCategoryName: draft.category.trim() || null,
          price: Number(draft.price),
          mrp: draft.mrp === '' ? null : Number(draft.mrp),
          unit: draft.unit.trim(),
          barcode: draft.barcode.trim() || null,
          description: draft.description.trim() || null,
          isActive: draft.isActive,
          trackStock: draft.trackStock,
          lowStockThreshold: draft.trackStock ? Number(draft.lowStock) : 5,
          openingStock: draft.trackStock ? (draft.openingStock === '' ? 0 : Number(draft.openingStock)) : null,
          imageIds: ready.map((p) => p.id!),
        });
        added++;
        draft.photos.forEach(releasePhoto);
      } catch (e) {
        left.push({ ...draft, photos: ready, error: toApiError(e).message });
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
    this.drafts().forEach((d) => d.photos.forEach(releasePhoto));
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
