import { Component, computed, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

export type IconWeight = 'regular' | 'fill' | 'duotone';

/** An icon from the bundled Phosphor set (public/icons). Size and colour come from the surrounding font-size and text colour. */
@Component({
  selector: 'app-icon',
  imports: [IonIcon],
  template: `<ion-icon [src]="src()" aria-hidden="true" />`,
  styles: `:host { display: inline-flex; align-items: center; justify-content: center; line-height: 1; } ion-icon { font-size: 1em; }`,
})
export class AppIcon {
  readonly name = input.required<string>();
  readonly weight = input<IconWeight>('regular');
  protected readonly src = computed(() => `icons/${this.weight()}/${this.name()}.svg`);
}
