import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonBackButton, IonBadge, IonButton, IonButtons, IonContent, IonHeader, IonInput, IonItem, IonLabel, IonList, IonSegment, IonSegmentButton, IonSpinner, IonText, IonTitle, IonToolbar } from '@ionic/angular';
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
  imports: [DatePipe, ReactiveFormsModule, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonBadge, IonSegment, IonSegmentButton, IonLabel, IonInput, IonButton, IonList, IonItem, IonSpinner, IonText],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button [defaultHref]="'/shops/' + shopId + '/items/' + itemId" /></ion-buttons>
        <ion-title>Stock</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <main class="page-column">
        @if (error(); as message) {
          <ion-text color="danger" role="alert"><p>{{ message }}</p></ion-text>
        }
        @if (item(); as i) {
          <h1>{{ i.name }}</h1>
          @if (!i.trackStock) {
            <div class="notice" role="status"><strong>Stock is not counted for this item.</strong>Switch on "Count stock for this item" on the item page first.</div>
          } @else {
            <div class="stock-now">
              <span class="value" aria-live="polite">{{ i.stockQuantity }}</span>
              <span>in stock · {{ i.unit }}</span>
              @if (state(i); as st) { @if (st.color !== 'light') { <ion-badge [color]="st.color">{{ st.label }}</ion-badge> } }
            </div>
            <p class="meta">You are warned when it falls to {{ i.lowStockThreshold }}.</p>

            <h2 class="section-title">Change stock</h2>
            <ion-segment [value]="kind()" (ionChange)="kind.set($any($event.detail.value)); form.controls.quantity.reset(null)">
              <ion-segment-button value="Restock"><ion-label>Received</ion-label></ion-segment-button>
              <ion-segment-button value="Damage"><ion-label>Damaged</ion-label></ion-segment-button>
              <ion-segment-button value="Correction"><ion-label>Recount</ion-label></ion-segment-button>
            </ion-segment>
            <form [formGroup]="form" (ngSubmit)="save()" novalidate class="stack ion-margin-top">
              <ion-input formControlName="quantity" type="number" inputmode="numeric" min="0" step="1"
                [label]="quantityLabel()" labelPlacement="stacked" fill="outline" errorText="Enter a whole number" />
              <ion-input formControlName="note" label="Note (optional)" labelPlacement="stacked" fill="outline"
                placeholder="For example the supplier or the reason" maxlength="300" />
              @if (saveError(); as message) {
                <ion-text color="danger" role="alert"><p class="message">{{ message }}</p></ion-text>
              }
              <ion-button type="submit" expand="block" [disabled]="busy()">
                @if (busy()) { <ion-spinner name="crescent" aria-label="Saving" /> } @else { {{ buttonLabel() }} }
              </ion-button>
            </form>

            <h2 class="section-title">History</h2>
            <ion-list>
              @for (m of history(); track m.id) {
                <ion-item>
                  <ion-label>
                    <h2>{{ reason(m) }}@if (m.orderNumber) { · {{ m.orderNumber }} }</h2>
                    @if (m.note) { <p>{{ m.note }}</p> }
                    <p class="meta">{{ m.at | date: 'd MMM y, h:mm a' }} · {{ m.quantityAfter }} in stock after</p>
                  </ion-label>
                  <ion-badge slot="end" [color]="m.change > 0 ? 'success' : m.change < 0 ? 'danger' : 'light'">
                    {{ m.change > 0 ? '+' + m.change : m.change }}
                  </ion-badge>
                </ion-item>
              }
            </ion-list>
          }
        } @else if (!error()) {
          <div class="centered"><ion-spinner name="crescent" aria-label="Loading stock" /></div>
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
