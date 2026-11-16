import { Component, input } from '@angular/core';
import { IonSkeletonText } from '@ionic/angular';

/** Grey shapes shown while a product grid loads, in the same layout as the real cards. */
@Component({
  selector: 'app-skeleton-products',
  imports: [IonSkeletonText],
  template: `
    <div class="product-grid" aria-hidden="true">
      @for (n of rows(); track n) {
        <div class="sk-card">
          <ion-skeleton-text animated class="sk-photo" />
          <ion-skeleton-text animated class="sk-line" />
          <ion-skeleton-text animated class="sk-line short" />
        </div>
      }
    </div>
  `,
})
export class SkeletonProducts {
  protected readonly rows = () => Array.from({ length: 6 }, (_, i) => i);
}

/** Grey shapes for a list of shop cards or orders. */
@Component({
  selector: 'app-skeleton-list',
  imports: [IonSkeletonText],
  template: `
    <div class="sk-list" aria-hidden="true">
      @for (n of rows(); track n) {
        <div class="sk-row">
          <ion-skeleton-text animated class="sk-logo" />
          <div class="sk-text">
            <ion-skeleton-text animated class="sk-line" />
            <ion-skeleton-text animated class="sk-line short" />
          </div>
        </div>
      }
    </div>
  `,
})
export class SkeletonList {
  readonly count = input(3);
  protected readonly rows = () => Array.from({ length: this.count() }, (_, i) => i);
}
