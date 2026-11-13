import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AlertController, IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonInput, IonItem, IonSelect, IonSelectOption, IonSpinner, IonText, IonTextarea, IonTitle, IonToggle, IonToolbar, NavController } from '@ionic/angular';
import { toApiError } from '../core/api-error';
import { Category } from '../core/shop.models';
import { ShopService, fileUrl } from '../core/shop.service';

function priceNotAboveMrp(group: AbstractControl): ValidationErrors | null {
  const price = Number(group.get('price')?.value);
  const mrp = group.get('mrp')?.value;
  return mrp !== null && mrp !== '' && Number(mrp) < price ? { priceAboveMrp: true } : null;
}

/** Adds an item (/shops/:shopId/items/new) or edits one (/shops/:shopId/items/:itemId). */
@Component({
  selector: 'app-item-form',
  imports: [ReactiveFormsModule, RouterLink, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonInput, IonTextarea, IonSelect, IonSelectOption, IonToggle, IonItem, IonButton, IonSpinner, IonText],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button [defaultHref]="'/shops/' + shopId" /></ion-buttons>
        <ion-title>{{ itemId ? 'Edit item' : 'Add item' }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <main class="page-column">
        @if (loading()) {
          <div class="centered"><ion-spinner name="crescent" aria-label="Loading" /></div>
        } @else {
          <form [formGroup]="form" (ngSubmit)="save()" novalidate class="stack">
            <div class="photo-row">
              <div class="photo">
                @if (photoUrl(); as src) { <img [src]="src" alt="Item photo" /> } @else { <span>No photo</span> }
              </div>
              <ion-button fill="outline" [disabled]="busy()" (click)="picker.click()">
                {{ photoUrl() ? 'Change photo' : 'Add photo' }}
              </ion-button>
              <input #picker type="file" accept="image/jpeg,image/png,image/webp" hidden (change)="pickPhoto($event)" />
            </div>

            <ion-input formControlName="name" label="Item name" labelPlacement="stacked" fill="outline"
              errorText="Enter the item name" />
            <ion-select formControlName="categoryId" label="Category" labelPlacement="stacked" fill="outline"
              interface="popover" placeholder="No category">
              <ion-select-option [value]="null">No category</ion-select-option>
              @for (c of categories(); track c.id) {
                <ion-select-option [value]="c.id">{{ c.name }}</ion-select-option>
              }
            </ion-select>
            <div class="two-columns">
              <ion-input formControlName="price" type="number" inputmode="decimal" min="0" step="0.01"
                label="Price (₹)" labelPlacement="stacked" fill="outline" errorText="Enter a price above 0" />
              <ion-input formControlName="mrp" type="number" inputmode="decimal" min="0" step="0.01"
                label="MRP (₹, optional)" labelPlacement="stacked" fill="outline" />
            </div>
            @if (form.hasError('priceAboveMrp')) {
              <ion-text color="danger" role="alert"><p class="message">The price cannot be higher than the MRP.</p></ion-text>
            }
            <ion-input formControlName="unit" label="Unit" labelPlacement="stacked" fill="outline"
              placeholder="1 kg, 500 g, 1 piece" errorText="Enter what one unit is" />
            <ion-input formControlName="barcode" inputmode="numeric" label="Barcode (optional)" labelPlacement="stacked"
              fill="outline" />
            <ion-textarea formControlName="description" label="Description (optional)" labelPlacement="stacked"
              fill="outline" [autoGrow]="true" />
            <ion-item lines="none" class="plain-item">
              <ion-toggle formControlName="isActive">Visible to customers</ion-toggle>
            </ion-item>

            <h2 class="section-title">Stock</h2>
            <ion-item lines="none" class="plain-item">
              <ion-toggle formControlName="trackStock">Count stock for this item</ion-toggle>
            </ion-item>
            @if (form.controls.trackStock.value) {
              @if (countedBefore()) {
                <div class="panel">
                  <strong>{{ stockQuantity() }} in stock</strong>
                  <ion-button fill="outline" [routerLink]="['/shops', shopId, 'items', itemId, 'stock']">Add, remove or correct stock</ion-button>
                </div>
              } @else {
                <ion-input formControlName="openingStock" type="number" inputmode="numeric" min="0" step="1"
                  label="How many do you have now?" labelPlacement="stacked" fill="outline" errorText="Enter 0 or more" />
              }
              <ion-input formControlName="lowStockThreshold" type="number" inputmode="numeric" min="0" step="1"
                label="Warn me when stock falls to" labelPlacement="stacked" fill="outline" errorText="Enter 0 or more" />
              <p class="meta">Customers cannot order more than you have. Orders reduce the stock, and cancelled orders put it back.</p>
            } @else {
              <p class="meta">Off: the item is always shown as available.</p>
            }

            @if (error(); as message) {
              <ion-text color="danger" role="alert"><p class="message">{{ message }}</p></ion-text>
            }

            <ion-button type="submit" expand="block" [disabled]="busy()">
              @if (busy()) { <ion-spinner name="crescent" aria-label="Saving" /> }
              @else { {{ itemId ? 'Save changes' : 'Add item' }} }
            </ion-button>
            @if (itemId) {
              <ion-button expand="block" fill="clear" color="danger" [disabled]="busy()" (click)="remove()">
                Delete item
              </ion-button>
            }
          </form>
        }
      </main>
    </ion-content>
  `,
})
export class ItemFormPage implements OnInit, OnDestroy {
  private readonly shops = inject(ShopService);
  private readonly nav = inject(NavController);
  private readonly alerts = inject(AlertController);
  private readonly params = inject(ActivatedRoute).snapshot.paramMap;

  protected readonly shopId = this.params.get('shopId')!;
  protected itemId = this.params.get('itemId');
  protected readonly form = inject(FormBuilder).group(
    {
      name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(150)]],
      categoryId: [null as string | null],
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
  protected readonly photoUrl = signal<string | null>(null);
  /** True when the saved item already counts stock; then the number changes only on the stock page. */
  protected readonly countedBefore = signal(false);
  protected readonly stockQuantity = signal(0);
  /** A photo chosen on screen but not uploaded yet. */
  private pendingPhoto: File | null = null;
  private previewUrl: string | null = null;

  async ngOnInit(): Promise<void> {
    try {
      const [categories, item] = await Promise.all([
        this.shops.categories(this.shopId),
        this.itemId ? this.shops.item(this.shopId, this.itemId) : null,
      ]);
      this.categories.set(categories);
      if (item) {
        this.form.patchValue({ ...item, barcode: item.barcode ?? '', description: item.description ?? '' });
        this.photoUrl.set(fileUrl(item.imageUrl));
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
    this.releasePreview();
  }

  protected pickPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this.error.set('The photo is larger than 5 MB. Please choose a smaller one.');
      return;
    }
    this.error.set('');
    this.releasePreview();
    this.pendingPhoto = file;
    this.previewUrl = URL.createObjectURL(file);
    this.photoUrl.set(this.previewUrl);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;

    this.busy.set(true);
    this.error.set('');
    try {
      const v = this.form.getRawValue();
      const input = {
        name: v.name!.trim(),
        categoryId: v.categoryId,
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
      const item = this.itemId
        ? await this.shops.updateItem(this.shopId, this.itemId, input)
        : await this.shops.createItem(this.shopId, input);
      // From here on the item exists, so a failed photo upload must not create it a second time on retry.
      this.itemId = item.id;
      if (this.pendingPhoto) {
        await this.shops.uploadItemImage(this.shopId, item.id, this.pendingPhoto);
        this.pendingPhoto = null;
      }
      await this.nav.navigateBack(['/shops', this.shopId]);
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

  private releasePreview(): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
  }
}
