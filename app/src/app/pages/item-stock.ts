import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonInput, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular';
import { AppIcon } from '../core/icon';
import { SkeletonList } from '../core/skeletons';
import { toApiError } from '../core/api-error';
import { Item, StockMovement, StockReason, stockState } from '../core/shop.models';
import { ShopService } from '../core/shop.service';

type Kind = 'Restock' | 'Damage' | 'Correction';

const REASONS: Record<StockReason, string> = {
  Opening: 'Opening stock',
  Restock: 'Stock received',
  Sale: 'Sold',
  OrderCancelled: 'Order cancelled',
  Damage: 'Damaged or expired',
  Correction: 'Count corrected',
};

/** One item's stock: the number on hand, a form to change it, and the history of every change. */
@Component({
  selector: 'app-item-stock',
  imports: [DatePipe, ReactiveFormsModule, AppIcon, SkeletonList, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonInput, IonButton, IonSpinner],
  template: `
    <ion-header class="shop-header">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button [defaultHref]="'/shops/' + shopId + '/items/' + itemId" text="" /></ion-buttons>
        <ion-title>Stock</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="shop-bg">
      <main class="shop-column narrow owner-form">
        @if (error(); as message) {
          <div class="card"><p role="alert" class="error-text">{{ message }}</p></div>
        }
        @if (item(); as i) {
          @if (!i.trackStock) {
            <div class="card closed-note" role="status"><strong>Stock is not counted for this item.</strong> Switch on "Count stock for this item" on the item page first.</div>
          } @else {
            <section class="stock-hero" [attr.data-color]="state(i)?.color">
              <span class="label">{{ i.name }} · {{ i.unit }}</span>
              <span class="value" aria-live="polite">{{ i.stockQuantity }}</span>
              <span class="sub">in stock @if (state(i); as st) { @if (st.color !== 'light') { · <strong>{{ st.label }}</strong> } }</span>
              <small>You are warned when it falls to {{ i.lowStockThreshold }}.</small>
            </section>

            <section class="card stack">
              <h2><span class="head-icon"><app-icon name="package" weight="duotone" /></span>Change stock</h2>
              <div class="owner-tabs inline" role="tablist" aria-label="What happened">
                @for (k of kinds; track k.value) {
                  <button type="button" role="tab" [attr.aria-selected]="kind() === k.value" [class.on]="kind() === k.value"
                    (click)="kind.set($any(k.value)); form.controls.quantity.reset(null)"><app-icon [name]="k.icon" />{{ k.label }}</button>
                }
              </div>
              <form [formGroup]="form" (ngSubmit)="save()" novalidate class="stack">
                <ion-input formControlName="quantity" type="number" inputmode="numeric" min="0" step="1"
                  [label]="quantityLabel()" labelPlacement="stacked" fill="outline" errorText="Enter a whole number" />
                <ion-input formControlName="note" label="Note (optional)" labelPlacement="stacked" fill="outline"
                  placeholder="For example the supplier or the reason" maxlength="300" />
                @if (saveError(); as message) { <p role="alert" class="error-text">{{ message }}</p> }
                <ion-button type="submit" expand="block" [disabled]="busy()">
                  @if (busy()) { <ion-spinner name="crescent" aria-label="Saving" /> } @else { {{ buttonLabel() }} }
                </ion-button>
              </form>
            </section>

            <section class="card">
              <h2><span class="head-icon"><app-icon name="clock" weight="duotone" /></span>History</h2>
              @if (history().length === 0) { <p class="hint">No changes yet.</p> }
              <ul class="order-lines stock-history">
                @for (m of history(); track m.id) {
                  <li>
                    <span class="change" [attr.data-sign]="m.change > 0 ? 'up' : m.change < 0 ? 'down' : 'same'">{{ m.change > 0 ? '+' + m.change : m.change }}</span>
                    <span class="what">
                      <strong>{{ reason(m) }}@if (m.orderNumber) { · {{ m.orderNumber }} }</strong>
                      @if (m.note) { <small>{{ m.note }}</small> }
                      <small>{{ m.at | date: 'd MMM y, h:mm a' }} · {{ m.quantityAfter }} in stock after</small>
                    </span>
                  </li>
                }
              </ul>
            </section>
          }
        } @else if (!error()) {
          <app-skeleton-list [count]="2" />
        }
      </main>
    </ion-content>
  `,
})
export class ItemStockPage {
  private readonly shops = inject(ShopService);
  private readonly params = inject(ActivatedRoute).snapshot.paramMap;

  protected readonly shopId = this.params.get('shopId')!;
  protected readonly itemId = this.params.get('itemId')!;
  protected readonly item = signal<Item | null>(null);
  protected readonly history = signal<StockMovement[]>([]);
  protected readonly kinds = [
    { value: 'Restock', label: 'Received', icon: 'plus' },
    { value: 'Damage', label: 'Damaged', icon: 'minus' },
    { value: 'Correction', label: 'Recount', icon: 'pen' },
  ];
  protected readonly kind = signal<Kind>('Restock');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly saveError = signal('');
  protected readonly state = stockState;
  protected readonly form = inject(FormBuilder).group({
    quantity: [null as number | null, [Validators.required, Validators.min(0), Validators.max(1000000), Validators.pattern(/^\d+$/)]],
    note: [''],
  });

  protected reason(movement: StockMovement): string {
    return REASONS[movement.reason];
  }

  protected quantityLabel(): string {
    return { Restock: 'How many did you receive?', Damage: 'How many were damaged or expired?', Correction: 'How many are on the shelf now?' }[this.kind()];
  }

  protected buttonLabel(): string {
    return { Restock: 'Add to stock', Damage: 'Remove from stock', Correction: 'Set stock to this number' }[this.kind()];
  }

  ionViewWillEnter(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.error.set('');
    try {
      const [item, history] = await Promise.all([this.shops.item(this.shopId, this.itemId), this.shops.stockHistory(this.shopId, this.itemId)]);
      this.item.set(item);
      this.history.set(history);
    } catch (e) {
      this.error.set(toApiError(e).message);
    }
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    const quantity = Number(this.form.getRawValue().quantity);
    const kind = this.kind();
    if (kind !== 'Correction' && quantity === 0) {
      this.saveError.set('Enter a number above 0.');
      return;
    }

    this.busy.set(true);
    this.saveError.set('');
    try {
      const note = this.form.getRawValue().note?.trim() || null;
      const adjustment =
        kind === 'Correction' ? { setTo: quantity, reason: kind, note }
        : { change: kind === 'Restock' ? quantity : -quantity, reason: kind, note };
      this.item.set(await this.shops.adjustStock(this.shopId, this.itemId, adjustment));
      this.history.set(await this.shops.stockHistory(this.shopId, this.itemId));
      this.form.reset({ quantity: null, note: '' });
    } catch (e) {
      this.saveError.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
