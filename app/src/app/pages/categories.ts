import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonInput, IonTitle, IonToolbar } from '@ionic/angular';
import { categoryIcon } from '../core/category-icon';
import { AppIcon } from '../core/icon';
import { SkeletonList } from '../core/skeletons';
import { toApiError } from '../core/api-error';
import { Category } from '../core/shop.models';
import { ShopService } from '../core/shop.service';

@Component({
  selector: 'app-categories',
  imports: [ReactiveFormsModule, AppIcon, SkeletonList, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonInput, IonButton],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button [defaultHref]="'/shops/' + shopId" text="" /></ion-buttons>
        <ion-title>Categories</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="shop-bg">
      <main class="shop-column narrow owner-form">
        <form class="card add-category" [formGroup]="form" (ngSubmit)="add()" novalidate>
          <h2><span class="head-icon"><app-icon name="plus" /></span>New category</h2>
          <div class="add-line">
            <ion-input formControlName="name" label="Category name" labelPlacement="stacked" fill="outline"
              placeholder="For example Dairy" maxlength="80" />
            <ion-button type="submit" [disabled]="busy()">Add</ion-button>
          </div>
          <p class="hint">Categories group your items so customers find them faster, for example Dairy, Snacks or Vegetables.</p>
        </form>

        @if (error(); as message) {
          <div class="card"><p role="alert" class="error-text">{{ message }}</p></div>
        }

        @if (loading()) {
          <app-skeleton-list [count]="4" />
        } @else if (categories().length === 0) {
          <div class="card empty-card">
            <span class="empty-art small"><app-icon name="squares-four" weight="duotone" /></span>
            <p>No categories yet.</p>
          </div>
        } @else {
          <ul class="owner-item-list single">
            @for (c of categories(); track c.id) {
              <li class="owner-item static">
                <span class="thumb"><app-icon [name]="icon(c.name)" weight="duotone" /></span>
                <span class="what"><strong>{{ c.name }}</strong><small>{{ c.itemCount }} {{ c.itemCount === 1 ? 'item' : 'items' }}</small></span>
                <button type="button" class="round-btn" [attr.aria-label]="'Rename ' + c.name" (click)="rename(c)"><app-icon name="pen" /></button>
                <button type="button" class="round-btn danger" [attr.aria-label]="'Delete ' + c.name" (click)="remove(c)"><app-icon name="trash" /></button>
              </li>
            }
          </ul>
        }
      </main>
    </ion-content>
  `,
})
export class CategoriesPage {
  private readonly shops = inject(ShopService);
  private readonly alerts = inject(AlertController);

  protected readonly shopId = inject(ActivatedRoute).snapshot.paramMap.get('shopId')!;
  protected readonly form = inject(FormBuilder).nonNullable.group({ name: ['', Validators.maxLength(80)] });
  protected readonly categories = signal<Category[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly icon = categoryIcon;

  ionViewWillEnter(): void {
    void this.run(async () => undefined);
  }

  protected async add(): Promise<void> {
    const name = this.form.getRawValue().name.trim();
    if (!name || this.busy()) return;
    // New categories go to the end of the list.
    const next = Math.max(0, ...this.categories().map((c) => c.sortOrder)) + 1;
    await this.run(async () => {
      await this.shops.createCategory(this.shopId, name, next);
      this.form.reset();
    });
  }

  protected async rename(category: Category): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Rename category',
      inputs: [{ name: 'name', type: 'text', value: category.name, attributes: { maxlength: 80 } }],
      buttons: [{ text: 'Cancel', role: 'cancel' }, { text: 'Save', role: 'confirm' }],
    });
    await alert.present();
    const { role, data } = await alert.onDidDismiss();
    const name = (data?.values?.name ?? '').trim();
    if (role !== 'confirm' || !name || name === category.name) return;
    await this.run(() => this.shops.updateCategory(this.shopId, category.id, name, category.sortOrder));
  }

  protected async remove(category: Category): Promise<void> {
    const alert = await this.alerts.create({
      header: `Delete ${category.name}?`,
      message: category.itemCount
        ? `Its ${category.itemCount} item(s) will be kept without a category.`
        : 'This category has no items.',
      buttons: [{ text: 'Cancel', role: 'cancel' }, { text: 'Delete', role: 'destructive' }],
    });
    await alert.present();
    if ((await alert.onDidDismiss()).role !== 'destructive') return;
    await this.run(() => this.shops.deleteCategory(this.shopId, category.id));
  }

  /** Runs a change, then reloads the list so counts and order are always what the server has. */
  private async run(change: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await change();
      this.categories.set(await this.shops.categories(this.shopId));
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
      this.loading.set(false);
    }
  }
}
