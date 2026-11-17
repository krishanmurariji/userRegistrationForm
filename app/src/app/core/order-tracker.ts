import { DatePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { AppIcon } from './icon';
import { Order, OrderStatus } from './store.models';

const STEPS: { status: OrderStatus; label: string; waiting: string; icon: string; event: string }[] = [
  { status: 'Placed', label: 'Order placed', waiting: 'Order placed', icon: 'receipt', event: 'Order placed' },
  { status: 'Accepted', label: 'Accepted by the shop', waiting: 'Waiting for the shop to accept', icon: 'seal-check', event: 'Order accepted' },
  { status: 'Packed', label: 'Packed', waiting: 'Being packed', icon: 'package', event: 'Order packed' },
  { status: 'OutForDelivery', label: 'Out for delivery', waiting: 'Out for delivery', icon: 'moped', event: 'Out for delivery' },
  { status: 'Delivered', label: 'Delivered', waiting: 'Delivered', icon: 'house', event: 'Delivered' },
];

/** The order's journey as a row of steps: done, current, and still to come. */
@Component({
  selector: 'app-order-tracker',
  imports: [DatePipe, AppIcon],
  template: `
    @if (order().status === 'Cancelled') {
      <div class="tracker-cancelled" role="status">
        <app-icon name="x-circle" weight="duotone" />
        <div><strong>Order cancelled</strong>@if (order().cancelReason) { <span>{{ order().cancelReason }}</span> }</div>
      </div>
    } @else {
      <ol class="tracker" [attr.aria-label]="'Order progress: ' + steps()[current()].label">
        @for (step of steps(); track step.status; let index = $index) {
          <li [class.done]="index < current()" [class.current]="index === current()" [attr.aria-current]="index === current() ? 'step' : null">
            <span class="mark">
              @if (index < current() || (step.status === 'Delivered' && index === current())) { <app-icon name="check" /> }
              @else { <app-icon [name]="step.icon" weight="duotone" /> }
            </span>
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
}
