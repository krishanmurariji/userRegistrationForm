import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonSpinner, IonText, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { createOutline, trashOutline } from 'ionicons/icons';
import { toApiError } from '../core/api-error';
import { Category } from '../core/shop.models';
import { ShopService } from '../core/shop.service';

@Component({
  selector: 'app-categories',
  imports: [ReactiveFormsModule, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonList, IonItem, IonLabel, IonInput, IonButton, IonIcon, IonSpinner, IonText],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button [defaultHref]="'/shops/' + shopId" /></ion-buttons>
        <ion-title>Categories</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <main class="page-column">
        <form class="add-row" [formGroup]="form" (ngSubmit)="add()" novalidate>
          <ion-input formControlName="name" label="New category" labelPlacement="stacked" fill="outline"
            placeholder="For example Dairy" maxlength="80" />
          <ion-button type="submit" [disabled]="busy()">Add</ion-button>
        </form>

        @if (error(); as message) {
          <ion-text color="danger" role="alert"><p class="message">{{ message }}</p></ion-text>
        }

        @if (loading()) {
          <div class="centered"><ion-spinner name="crescent" aria-label="Loading categories" /></div>
        } @else if (categories().length === 0) {
          <p class="muted">No categories yet. Categories group your items, for example Dairy, Snacks or Vegetables.</p>
        } @else {
          <ion-list>
            @for (c of categories(); track c.id) {
              <ion-item>
                <ion-label>
                  <h2>{{ c.name }}</h2>
                  <p>{{ c.itemCount }} {{ c.itemCount === 1 ? 'item' : 'items' }}</p>
                </ion-label>
                <ion-button slot="end" fill="clear" [attr.aria-label]="'Rename ' + c.name" (click)="rename(c)">
                  <ion-icon slot="icon-only" name="create-outline" />
                </ion-button>
                <ion-button slot="end" fill="clear" color="danger" [attr.aria-label]="'Delete ' + c.name" (click)="remove(c)">
                  <ion-icon slot="icon-only" name="trash-outline" />
                </ion-button>
              </ion-item>
            }
          </ion-list>
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

  constructor() {
    addIcons({ createOutline, trashOutline });
  }

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
