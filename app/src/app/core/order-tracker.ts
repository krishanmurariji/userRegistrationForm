import { DatePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { bagCheckOutline, bicycleOutline, checkmark, closeOutline, cubeOutline, homeOutline, receiptOutline } from 'ionicons/icons';
import { Order, OrderStatus } from './store.models';

const STEPS: { status: OrderStatus; label: string; waiting: string; icon: string; event: string }[] = [
  { status: 'Placed', label: 'Order placed', waiting: 'Order placed', icon: 'receipt-outline', event: 'Order placed' },
  { status: 'Accepted', label: 'Accepted by the shop', waiting: 'Waiting for the shop to accept', icon: 'bag-check-outline', event: 'Order accepted' },
  { status: 'Packed', label: 'Packed', waiting: 'Being packed', icon: 'cube-outline', event: 'Order packed' },
  { status: 'OutForDelivery', label: 'Out for delivery', waiting: 'Out for delivery', icon: 'bicycle-outline', event: 'Out for delivery' },
  { status: 'Delivered', label: 'Delivered', waiting: 'Delivered', icon: 'home-outline', event: 'Delivered' },
];

/** The order's journey as a row of steps: done, current, and still to come. */
@Component({
  selector: 'app-order-tracker',
  imports: [DatePipe, IonIcon],
  template: `
    @if (order().status === 'Cancelled') {
      <div class="tracker-cancelled" role="status">
        <ion-icon name="close-outline" aria-hidden="true" />
        <div><strong>Order cancelled</strong>@if (order().cancelReason) { <span>{{ order().cancelReason }}</span> }</div>
      </div>
    } @else {
      <ol class="tracker" [attr.aria-label]="'Order progress: ' + steps()[current()].label">
        @for (step of steps(); track step.status; let index = $index) {
          <li [class.done]="index < current()" [class.current]="index === current()" [attr.aria-current]="index === current() ? 'step' : null">
            <span class="mark"><ion-icon [name]="index < current() || step.status === 'Delivered' && index === current() ? 'checkmark' : step.icon" aria-hidden="true" /></span>
            <span class="text">
              <strong>{{ index === current() + 1 ? step.waiting : step.label }}</strong>
              @if (step.at) { <small>{{ step.at | date: 'd MMM, h:mm a' }}</small> }
            </span>
          </li>
        }
      </ol>
    }
  `,
})
export class OrderTracker {
  readonly order = input.required<Order>();

  protected readonly current = computed(() => Math.max(0, STEPS.findIndex((s) => s.status === this.order().status)));
  protected readonly steps = computed(() =>
    STEPS.map((step) => ({ ...step, at: this.order().events.find((e) => e.title === step.event)?.at ?? null })),
  );

  constructor() {
    addIcons({ bagCheckOutline, bicycleOutline, checkmark, closeOutline, cubeOutline, homeOutline, receiptOutline });
  }
}
