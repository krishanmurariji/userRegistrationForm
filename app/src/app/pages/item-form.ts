import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AlertController, IonBackButton, IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonInput, IonSelect, IonSelectOption, IonSpinner, IonTextarea, IonTitle, IonToggle, IonToolbar, NavController } from '@ionic/angular';
import { toApiError } from '../core/api-error';
import { AppIcon } from '../core/icon';
import { SkeletonList } from '../core/skeletons';
import { Category, Item } from '../core/shop.models';
import { PhotoEntry, PhotoPicker, photoFromFile, releasePhoto } from '../core/photo-picker';
import { ShopService, fileUrl } from '../core/shop.service';

function priceNotAboveMrp(group: AbstractControl): ValidationErrors | null {
  const price = Number(group.get('price')?.value);
  const mrp = group.get('mrp')?.value;
  return mrp !== null && mrp !== '' && Number(mrp) < price ? { priceAboveMrp: true } : null;
}

/** Adds an item (/shops/:shopId/items/new) or edits one (/shops/:shopId/items/:itemId). */
@Component({
  selector: 'app-item-form',
  imports: [ReactiveFormsModule, RouterLink, PhotoPicker, AppIcon, SkeletonList, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonFooter, IonInput, IonTextarea, IonSelect, IonSelectOption, IonToggle, IonButton, IonSpinner],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button [defaultHref]="'/shops/' + shopId" text="" /></ion-buttons>
        <ion-title>{{ itemId ? 'Edit item' : 'Add item' }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="shop-bg">
      <main class="shop-column narrow owner-form">
        @if (loading()) {
          <app-skeleton-list [count]="3" />
        } @else {
          <form [formGroup]="form" (ngSubmit)="save()" novalidate>
            @if (!itemId) {
              <a class="ai-banner" [routerLink]="['/shops', shopId, 'scan']">
                <span class="ai-icon"><app-icon name="sparkle" weight="duotone" /></span>
                <span class="what"><strong>Have the product in your hand?</strong>
                  <small>Take a photo and the name, size and MRP are filled in for you. You only add the price.</small></span>
                <span class="go">Try it <app-icon name="arrow-right" /></span>
              </a>
            }
            @if (copied()) {
              <div class="card closed-note" role="status"><strong>This is a copy.</strong> Change the name, unit and price, then switch on "Visible to customers".</div>
            }

            <section class="card">
              <app-photo-picker label="Pictures" [photos]="photos()" [busy]="busy()" [minKeep]="itemId ? 1 : 0"
                (add)="addPhotos($event)" (remove)="removePhoto($event)" (makeCover)="coverPhoto($event)" (problem)="error.set($event)" />
            </section>

            <section class="card stack">
              <h2><span class="head-icon"><app-icon name="tag" weight="duotone" /></span>Details</h2>
              <ion-input formControlName="name" label="Item name" labelPlacement="stacked" fill="outline"
                errorText="Enter the item name" />
              <ion-select formControlName="categoryId" label="Category" labelPlacement="stacked" fill="outline"
                interface="popover" placeholder="No category">
                <ion-select-option [value]="null">No category</ion-select-option>
                @for (c of categories(); track c.id) {
                  <ion-select-option [value]="c.id">{{ c.name }}</ion-select-option>
                }
                <ion-select-option [value]="newCategory">+ New category…</ion-select-option>
              </ion-select>
              @if (form.controls.categoryId.value === newCategory) {
                <ion-input formControlName="newCategoryName" label="New category name" labelPlacement="stacked" fill="outline"
                  placeholder="For example Dairy" maxlength="80" errorText="Enter a name for the new category" />
              }
              <div class="two-columns">
                <ion-input formControlName="unit" label="Unit" labelPlacement="stacked" fill="outline"
                  placeholder="1 kg, 500 g, 1 piece" errorText="Enter what one unit is" />
                <ion-input formControlName="barcode" inputmode="numeric" label="Barcode (optional)" labelPlacement="stacked"
                  fill="outline" />
              </div>
              <ion-textarea formControlName="description" label="Description (optional)" labelPlacement="stacked"
                fill="outline" [autoGrow]="true" />
            </section>

            <section class="card stack">
              <h2><span class="head-icon"><app-icon name="wallet" weight="duotone" /></span>Price</h2>
              <div class="two-columns">
                <ion-input formControlName="price" type="number" inputmode="decimal" min="0" step="0.01"
                  label="Your price (₹)" labelPlacement="stacked" fill="outline" errorText="Enter a price above 0" />
                <ion-input formControlName="mrp" type="number" inputmode="decimal" min="0" step="0.01"
                  label="MRP (₹, optional)" labelPlacement="stacked" fill="outline" />
              </div>
              @if (form.hasError('priceAboveMrp')) {
                <p role="alert" class="error-text">The price cannot be higher than the MRP.</p>
              } @else if (saving(); as off) {
                <p class="price-preview"><app-icon name="tag" />Customers see <strong>{{ off }}% off</strong> the MRP.</p>
              }
            </section>

            <section class="card stack">
              <h2><span class="head-icon"><app-icon name="package" weight="duotone" /></span>Stock</h2>
              <label class="switch-row">
                <span><strong>Count stock for this item</strong><small>{{ form.controls.trackStock.value ? 'Customers cannot order more than you have.' : 'Off: the item is always shown as available.' }}</small></span>
                <ion-toggle formControlName="trackStock" aria-label="Count stock for this item" />
              </label>
              @if (form.controls.trackStock.value) {
                @if (countedBefore()) {
                  <div class="stock-now">
                    <span><b>{{ stockQuantity() }}</b> in stock</span>
                    <ion-button fill="outline" size="small" [routerLink]="['/shops', shopId, 'items', itemId, 'stock']">Add, remove or correct</ion-button>
                  </div>
                } @else {
                  <ion-input formControlName="openingStock" type="number" inputmode="numeric" min="0" step="1"
                    label="How many do you have now?" labelPlacement="stacked" fill="outline" errorText="Enter 0 or more" />
                }
                <ion-input formControlName="lowStockThreshold" type="number" inputmode="numeric" min="0" step="1"
                  label="Warn me when stock falls to" labelPlacement="stacked" fill="outline" errorText="Enter 0 or more" />
                <p class="hint">Orders reduce the stock, and cancelled orders put it back.</p>
              }
            </section>

            <section class="card">
              <label class="switch-row">
                <span><strong>Visible to customers</strong><small>{{ form.controls.isActive.value ? 'Customers can see and order it.' : 'Hidden: only you can see it.' }}</small></span>
                <ion-toggle formControlName="isActive" aria-label="Visible to customers" />
              </label>
            </section>

            @if (error(); as message) {
              <div class="card"><p role="alert" class="error-text">{{ message }}</p></div>
            }

            @if (itemId) {
              <section class="card danger-zone">
                <h2><span class="head-icon"><app-icon name="copy" /></span>More</h2>
                <div class="actions">
                  <ion-button fill="outline" [disabled]="busy()" (click)="duplicate()">Duplicate for another size</ion-button>
                  <ion-button fill="clear" color="danger" [disabled]="busy()" (click)="remove()"><app-icon slot="start" name="trash" />Delete item</ion-button>
                </div>
              </section>
            }
            <button type="submit" hidden aria-hidden="true" tabindex="-1"></button>
          </form>
        }
      </main>
    </ion-content>
    @if (!loading()) {
      <ion-footer class="shop-footer">
        <div class="pay-bar">
          <span><small>{{ itemId ? 'Editing' : 'New item' }}</small><strong>{{ form.controls.name.value || 'Untitled' }}</strong></span>
          <ion-button [disabled]="busy()" (click)="save()">
            @if (busy()) { <ion-spinner name="crescent" aria-label="Saving" /> }
            @else { {{ itemId ? 'Save changes' : 'Add item' }}<app-icon slot="end" name="check" /> }
          </ion-button>
        </div>
      </ion-footer>
    }
  `,
})
export class ItemFormPage implements OnInit, OnDestroy {
  private readonly shops = inject(ShopService);
  private readonly nav = inject(NavController);
  private readonly alerts = inject(AlertController);
  private readonly router = inject(Router);
  private readonly params = inject(ActivatedRoute).snapshot.paramMap;

  protected readonly shopId = this.params.get('shopId')!;
  protected itemId = this.params.get('itemId');
  protected readonly form = inject(FormBuilder).group(
    {
      name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(150)]],
      categoryId: [null as string | null],
      newCategoryName: ['', Validators.maxLength(80)],
      price: [null as number | null, [Validators.required, Validators.min(0.01), Validators.max(1000000)]],
      mrp: [null as number | null, [Validators.min(0.01), Validators.max(1000000)]],
      unit: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(30)]],
      barcode: ['', Validators.maxLength(64)],
      description: ['', Validators.maxLength(2000)],
      isActive: [true],
      trackStock: [false],
      openingStock: [0 as number | null, [Validators.min(0), Validators.max(1000000)]],
      lowStockThreshold: [5 as number | null, [Validators.required, Validators.min(0), Validators.max(100000)]],
    },
    { validators: priceNotAboveMrp },
  );
  protected readonly categories = signal<Category[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  /** The value of the "+ New category…" choice in the category list. */
  protected readonly newCategory = '__new__';
  /** True when this page was opened on a freshly made copy. */
  protected readonly copied = signal(inject(ActivatedRoute).snapshot.queryParamMap.has('copied'));
  /** The pictures on screen. For a new item they are files not uploaded yet; for an existing item they are stored. */
  protected readonly photos = signal<PhotoEntry[]>([]);
  /** True when the saved item already counts stock; then the number changes only on the stock page. */
  protected readonly countedBefore = signal(false);
  protected readonly stockQuantity = signal(0);

  /** The discount customers will see, in whole percent, or 0 when there is none. */
  protected saving(): number {
    const { price, mrp } = this.form.getRawValue() as { price: number | null; mrp: number | null };
    const p = Number(price), m = Number(mrp);
    return p > 0 && m > p ? Math.round(((m - p) / m) * 100) : 0;
  }

  async ngOnInit(): Promise<void> {
    try {
      const [categories, item] = await Promise.all([
        this.shops.categories(this.shopId),
        this.itemId ? this.shops.item(this.shopId, this.itemId) : null,
      ]);
      this.categories.set(categories);
      if (item) {
        this.form.patchValue({ ...item, barcode: item.barcode ?? '', description: item.description ?? '' });
        this.photos.set(this.fromItem(item));
        this.countedBefore.set(item.trackStock);
        this.stockQuantity.set(item.stockQuantity);
      }
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.loading.set(false);
    }
  }

  /** Coming back from the stock page: show the new number. */
  async ionViewWillEnter(): Promise<void> {
    if (!this.itemId || this.loading()) return;
    try {
      this.stockQuantity.set((await this.shops.item(this.shopId, this.itemId)).stockQuantity);
    } catch {
      // The number on screen is only a reminder; the stock page has the real one.
    }
  }

  ngOnDestroy(): void {
    this.photos().forEach(releasePhoto);
  }

  private fromItem(item: Item): PhotoEntry[] {
    return item.images.map((image) => ({ key: image.id, url: fileUrl(image.url)!, id: image.id }));
  }

  /** New item: keep the files until it is saved. Existing item: each one goes to the server straight away. */
  protected async addPhotos(files: File[]): Promise<void> {
    this.error.set('');
    if (!this.itemId) {
      this.photos.update((list) => [...list, ...files.map(photoFromFile)]);
      return;
    }
    await this.changeStored(async (itemId) => {
      let item: Item | null = null;
      for (const file of files) item = await this.shops.addItemImage(this.shopId, itemId, file);
      return item;
    });
  }

  protected async removePhoto(entry: PhotoEntry): Promise<void> {
    this.error.set('');
    if (!this.itemId) {
      this.photos.update((list) => list.filter((p) => p.key !== entry.key));
      releasePhoto(entry);
      // It may already have been uploaded by an earlier attempt to save; do not leave it behind.
      if (entry.id) void this.shops.discardStagedImage(this.shopId, entry.id).catch(() => undefined);
      return;
    }
    await this.changeStored((itemId) => this.shops.deleteItemImage(this.shopId, itemId, entry.id!));
  }

  protected async coverPhoto(entry: PhotoEntry): Promise<void> {
    this.error.set('');
    if (!this.itemId) {
      this.photos.update((list) => [entry, ...list.filter((p) => p.key !== entry.key)]);
      return;
    }
    await this.changeStored((itemId) => this.shops.setCoverImage(this.shopId, itemId, entry.id!));
  }

  /** Runs a change to a saved item's pictures, then shows the pictures as the server now has them. */
  private async changeStored(change: (itemId: string) => Promise<Item | null>): Promise<void> {
    const itemId = this.itemId!;
    this.busy.set(true);
    try {
      const item = (await change(itemId)) ?? (await this.shops.item(this.shopId, itemId));
      this.photos.set(this.fromItem(item));
    } catch (e) {
      this.error.set(toApiError(e).message);
      // Show what is really stored, in case only some of the pictures went through.
      await this.shops.item(this.shopId, itemId).then((item) => this.photos.set(this.fromItem(item))).catch(() => undefined);
    } finally {
      this.busy.set(false);
    }
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    const noPicture = this.photos().length === 0;
    if (noPicture) this.error.set('Add at least one picture of the item.');
    if (this.form.invalid || noPicture || this.busy()) return;

    this.busy.set(true);
    this.error.set('');
    try {
      const v = this.form.getRawValue();
      const wantsNewCategory = v.categoryId === this.newCategory;
      const newCategoryName = wantsNewCategory ? v.newCategoryName?.trim() ?? '' : '';
      if (wantsNewCategory && !newCategoryName) {
        this.error.set('Enter a name for the new category.');
        this.busy.set(false);
        return;
      }
      const input = {
        name: v.name!.trim(),
        categoryId: wantsNewCategory ? null : v.categoryId,
        newCategoryName: newCategoryName || null,
        price: Number(v.price),
        mrp: v.mrp === null || (v.mrp as unknown) === '' ? null : Number(v.mrp),
        unit: v.unit!.trim(),
        barcode: v.barcode?.trim() || null,
        description: v.description?.trim() || null,
        isActive: v.isActive ?? true,
        trackStock: v.trackStock ?? false,
        lowStockThreshold: Math.floor(Number(v.lowStockThreshold ?? 5)),
        openingStock: v.trackStock && !this.countedBefore() ? Math.floor(Number(v.openingStock ?? 0)) : null,
      };
      if (this.itemId) {
        await this.shops.updateItem(this.shopId, this.itemId, input);
      } else {
        // Upload the chosen pictures first. A picture that already went up on an earlier try is not sent again.
        const ready = [...this.photos()];
        for (let index = 0; index < ready.length; index++) {
          if (ready[index].id) continue;
          ready[index] = { ...ready[index], id: (await this.shops.stageImage(this.shopId, ready[index].file!)).id };
          this.photos.set([...ready]);
        }
        await this.shops.createItem(this.shopId, { ...input, imageIds: ready.map((p) => p.id!) });
      }
      await this.nav.navigateBack(['/shops', this.shopId]);
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async duplicate(): Promise<void> {
    if (!this.itemId || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const copy = await this.shops.duplicateItem(this.shopId, this.itemId);
      await this.router.navigate(['/shops', this.shopId, 'items', copy.id], { queryParams: { copied: 1 }, replaceUrl: true });
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    if (!this.itemId) return;
    const alert = await this.alerts.create({
      header: 'Delete this item?',
      message: 'This cannot be undone.',
      buttons: [{ text: 'Cancel', role: 'cancel' }, { text: 'Delete', role: 'destructive' }],
    });
    await alert.present();
    if ((await alert.onDidDismiss()).role !== 'destructive') return;

    this.busy.set(true);
    try {
      await this.shops.deleteItem(this.shopId, this.itemId);
      await this.nav.navigateBack(['/shops', this.shopId]);
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
