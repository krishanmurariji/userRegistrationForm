import { Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, closeCircle, starOutline } from 'ionicons/icons';

export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** A picture shown in the picker: either a file chosen on screen, or one already stored for the item. */
export interface PhotoEntry {
  key: string;
  /** What to show: a local preview address for a chosen file, or the API address of a stored picture. */
  url: string;
  /** The chosen file, until it has been uploaded. */
  file?: File;
  /** The stored picture's id, once it is on the server. */
  id?: string;
}

/** Makes an entry for a chosen file with a preview. Call {@link releasePhoto} when it is no longer needed. */
export function photoFromFile(file: File): PhotoEntry {
  // randomUUID exists only in secure contexts, and a test build opened by an address like http://192.168.x.x is not one.
  const key = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { key, url: URL.createObjectURL(file), file };
}

export function releasePhoto(entry: PhotoEntry): void {
  if (entry.file) URL.revokeObjectURL(entry.url);
}

/**
 * A row of up to five pictures with add, remove and "make cover" controls. It only reports what the person did;
 * the page decides what that means (keep it on screen, or send it to the server).
 */
@Component({
  selector: 'app-photo-picker',
  imports: [IonIcon],
  template: `
    <div class="photo-picker" role="group" [attr.aria-label]="label()">
      <div class="photo-row-head">
        <strong>{{ label() }}</strong>
        <span [class.full]="photos().length >= max()">{{ photos().length }} of {{ max() }}</span>
      </div>
      <ul>
        @for (photo of photos(); track photo.key; let index = $index) {
          <li [class.cover]="index === 0">
            <img [src]="photo.url" [alt]="'Picture ' + (index + 1) + (index === 0 ? ' (cover)' : '')" />
            @if (index === 0) { <span class="badge">Cover</span> }
            <button type="button" class="remove" [disabled]="busy() || photos().length <= minKeep()"
              [attr.aria-label]="'Remove picture ' + (index + 1)" (click)="remove.emit(photo)">
              <ion-icon name="close-circle" />
            </button>
            @if (index > 0) {
              <button type="button" class="make-cover" [disabled]="busy()" [attr.aria-label]="'Make picture ' + (index + 1) + ' the cover'" (click)="makeCover.emit(photo)">
                <ion-icon name="star-outline" aria-hidden="true" /> Cover
              </button>
            }
          </li>
        }
        @if (photos().length < max()) {
          <li class="add">
            <button type="button" [disabled]="busy()" (click)="picker.click()">
              <ion-icon name="add-outline" aria-hidden="true" />
              <span>{{ photos().length === 0 ? 'Add a picture' : 'Add more' }}</span>
            </button>
            <input #picker type="file" accept="image/jpeg,image/png,image/webp" multiple hidden (change)="choose($event)" />
          </li>
        }
      </ul>
      <p class="hint">
        @if (photos().length === 0) { At least one picture is needed. }
        @else if (photos().length <= minKeep()) { An item always keeps at least one picture. }
        @else { The first picture is the cover shown to customers. }
      </p>
    </div>
  `,
})
export class PhotoPicker {
  readonly photos = input.required<PhotoEntry[]>();
  readonly max = input(MAX_PHOTOS);
  /** The smallest number of pictures that must remain, so the last one cannot be removed. */
  readonly minKeep = input(0);
  readonly label = input('Pictures');
  readonly busy = input(false);

  readonly add = output<File[]>();
  readonly remove = output<PhotoEntry>();
  readonly makeCover = output<PhotoEntry>();
  /** Something about the chosen files was wrong (too big, not a picture, too many). */
  readonly problem = output<string>();

  constructor() {
    addIcons({ addOutline, closeCircle, starOutline });
  }

  protected choose(event: Event): void {
    const input = event.target as HTMLInputElement;
    const chosen = Array.from(input.files ?? []);
    input.value = '';
    if (chosen.length === 0) return;

    const room = this.max() - this.photos().length;
    const pictures = chosen.filter((f) => ['image/jpeg', 'image/png', 'image/webp'].includes(f.type));
    const fine = pictures.filter((f) => f.size <= MAX_PHOTO_BYTES);
    const accepted = fine.slice(0, Math.max(room, 0));

    // The pictures go first: the page clears its message when it receives them, so the note must come after.
    if (accepted.length) this.add.emit(accepted);
    if (pictures.length < chosen.length) this.problem.emit('Only JPEG, PNG or WebP pictures can be used.');
    else if (fine.length < pictures.length) this.problem.emit('A picture is larger than 5 MB. Please choose a smaller one.');
    else if (accepted.length < fine.length) this.problem.emit(`An item can have up to ${this.max()} pictures. Only the first ${accepted.length} were added.`);
  }
}
