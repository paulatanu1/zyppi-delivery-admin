import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { LoadStatus } from '../../core/firebase/live';

/**
 * Loading (skeleton rows) / error (with retry) / empty / content, the four
 * states every async screen needs. Project the content; it shows when
 * status is ready and not empty.
 */
@Component({
  selector: 'z-page-state',
  imports: [ButtonModule, SkeletonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (status()) {
      @case ('loading') {
        <div class="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
          @for (i of rows; track i) {
            <p-skeleton height="56px" borderRadius="14px" />
          }
        </div>
      }
      @case ('error') {
        <div class="z-card p-8 text-center" role="alert">
          <i class="pi pi-exclamation-circle text-[28px] text-[var(--z-danger)]"></i>
          <p class="font-bold mt-3">{{ error() || 'Couldn’t load this.' }}</p>
          <p-button
            label="Try again"
            icon="pi pi-refresh"
            styleClass="mt-4"
            (onClick)="retry.emit()"
          />
        </div>
      }
      @default {
        @if (empty()) {
          <div class="z-card p-10 text-center">
            <i [class]="emptyIcon() + ' text-[28px] text-[var(--z-ink-3)]'"></i>
            <p class="font-bold mt-3">{{ emptyTitle() }}</p>
            @if (emptyText()) {
              <p class="z-muted mt-1">{{ emptyText() }}</p>
            }
          </div>
        } @else {
          <ng-content />
        }
      }
    }
  `,
})
export class PageState {
  readonly status = input.required<LoadStatus>();
  readonly error = input<string | null>(null);
  readonly empty = input(false);
  readonly emptyIcon = input('pi pi-inbox');
  readonly emptyTitle = input('Nothing here yet');
  readonly emptyText = input('');
  readonly retry = output<void>();
  protected readonly rows = [1, 2, 3, 4];
}
