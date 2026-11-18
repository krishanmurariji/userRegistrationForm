import { Component, computed, input } from '@angular/core';
import { AppIcon } from './icon';
import { OrderStatus } from './store.models';

const SHOP_TEXT: Record<OrderStatus, { title: string; text: string }> = {
  Placed: { title: 'New order', text: 'Accept it to let the customer know you are on it.' },
  Accepted: { title: 'Accepted', text: 'Pack the items next.' },
  Packed: { title: 'Packed', text: 'Send it out for delivery when the rider is ready.' },
  OutForDelivery: { title: 'Out for delivery', text: 'Mark it delivered when it reaches the customer.' },
  Delivered: { title: 'Delivered', text: 'This order is complete.' },
  Cancelled: { title: 'Cancelled', text: '' },
};

const STAGES: Record<OrderStatus, { icon: string; title: string; text: string; step: number }> = {
  Placed: { icon: 'receipt', title: 'Order placed', text: 'Waiting for the shop to accept it.', step: 0 },
  Accepted: { icon: 'seal-check', title: 'The shop accepted your order', text: 'They will pack it soon.', step: 1 },
  Packed: { icon: 'package', title: 'Packed and ready', text: 'It will be out for delivery soon.', step: 2 },
  OutForDelivery: { icon: 'moped', title: 'On the way to you', text: 'Please keep your phone nearby.', step: 3 },
  Delivered: { icon: 'house', title: 'Delivered', text: 'Thank you for ordering.', step: 4 },
  Cancelled: { icon: 'x-circle', title: 'Order cancelled', text: '', step: 0 },
};

/** The big status at the top of an order: what is happening now, and a scooter that rides along as it moves on. */
@Component({
  selector: 'app-order-hero',
  imports: [AppIcon],
  template: `
    @let s = stage();
    <section class="order-hero" [class.cancelled]="status() === 'Cancelled'" [class.delivered]="status() === 'Delivered'" role="status">
      <span class="pulse"><app-icon [name]="s.icon" weight="duotone" /></span>
      <div class="words">
        <h1>{{ s.title }}</h1>
        <p>{{ status() === 'Cancelled' ? (reason() || 'This order was cancelled.') : s.text }}</p>
        <small>{{ number() }} · {{ shopName() }}</small>
      </div>
      @if (status() !== 'Cancelled') {
        <div class="road" aria-hidden="true" [style.--progress]="progress()">
          <span class="fill"></span>
          @for (n of [0, 1, 2, 3, 4]; track n) { <i [class.on]="n <= s.step" [style.left.%]="n * 25"></i> }
          <span class="rider"><app-icon [name]="status() === 'Delivered' ? 'check-circle' : 'moped'" [weight]="status() === 'Delivered' ? 'fill' : 'duotone'" /></span>
        </div>
      }
    </section>
  `,
})
export class OrderHero {
  readonly status = input.required<OrderStatus>();
  readonly number = input.required<string>();
  readonly shopName = input.required<string>();
  readonly reason = input<string | null>(null);
  /** The customer reads "On the way to you"; the shop reads what to do next. */
  readonly audience = input<'customer' | 'shop'>('customer');

  protected readonly stage = computed(() => {
    const stage = STAGES[this.status()];
    return this.audience() === 'shop' ? { ...stage, ...SHOP_TEXT[this.status()] } : stage;
  });
  /** 0 to 1 along the road. */
  protected readonly progress = computed(() => this.stage().step / 4);
}
