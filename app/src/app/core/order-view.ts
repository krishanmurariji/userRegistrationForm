import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { Order } from './store.models';

/** The parts of an order shown the same way to the customer and the shop: items, totals, delivery details, timeline. */
@Component({
  selector: 'app-order-view',
  imports: [CurrencyPipe, DatePipe],
  template: `
    @let o = order();
    <h2 class="section-title">Items</h2>
    <table class="lines">
      <tbody>
        @for (line of o.items; track $index) {
          <tr>
            <td>
              {{ line.name }}
              <span class="meta">{{ line.unit }} · {{ line.unitPrice | currency: 'INR' : 'symbol' : '1.0-2' }} each</span>
            </td>
            <td class="qty">× {{ line.quantity }}</td>
            <td class="amount">{{ line.lineTotal | currency: 'INR' : 'symbol' : '1.0-2' }}</td>
          </tr>
        }
      </tbody>
      <tfoot>
        <tr><td colspan="2">Items total</td><td class="amount">{{ o.subtotal | currency: 'INR' : 'symbol' : '1.0-2' }}</td></tr>
        <tr><td colspan="2">Delivery fee</td><td class="amount">{{ o.deliveryFee | currency: 'INR' : 'symbol' : '1.0-2' }}</td></tr>
        <tr class="grand"><td colspan="2">Total</td><td class="amount">{{ o.total | currency: 'INR' : 'symbol' : '1.0-2' }}</td></tr>
      </tfoot>
    </table>

    <h2 class="section-title">Deliver to</h2>
    <p class="address">
      <strong>{{ o.customerName }}</strong><br />
      {{ o.addressLine }}, {{ o.city }} {{ o.pincode }}<br />
      <a [href]="'tel:' + o.phone">{{ o.phone }}</a>
    </p>
    @if (o.note) { <p class="address"><strong>Note:</strong> {{ o.note }}</p> }

    <h2 class="section-title">Order history</h2>
    <ol class="timeline">
      @for (event of o.events; track $index) {
        <li>
          <strong>{{ event.title }}</strong>
          <span class="meta">{{ event.at | date: 'd MMM, h:mm a' }}</span>
          @if (event.note) { <span class="note">{{ event.note }}</span> }
        </li>
      }
    </ol>
  `,
})
export class OrderView {
  readonly order = input.required<Order>();
}
