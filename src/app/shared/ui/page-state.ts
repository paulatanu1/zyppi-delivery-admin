import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzResultModule } from 'ng-zorro-antd/result';
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton';
import { LoadStatus } from '../../core/firebase/live';

/**
 * Loading (skeleton) / error (with retry) / empty / content, the four
 * states every async screen needs. Project the content; it shows when
 * status is ready and not empty.
 */
@Component({
  selector: 'z-page-state',
  imports: [NzButtonModule, NzEmptyModule, NzIconModule, NzResultModule, NzSkeletonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (status()) {
      @case ('loading') {
        <div class="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
          @for (i of rows; track i) {
            <div class="z-card p-5">
              <nz-skeleton [nzActive]="true" [nzTitle]="true" [nzParagraph]="{ rows: 1 }" />
            </div>
          }
        </div>
      }
      @case ('error') {
        <div class="z-card" role="alert">
          <nz-result nzStatus="warning" [nzTitle]="error() || 'Couldn’t load this.'">
            <div nz-result-extra>
              <button nz-button nzType="primary" (click)="retry.emit()">
                <span nz-icon nzType="reload"></span>Try again
              </button>
            </div>
          </nz-result>
        </div>
      }
      @default {
        @if (empty()) {
          <div class="z-card py-10">
            <nz-empty [nzNotFoundContent]="emptyTpl" />
            <ng-template #emptyTpl>
              <p class="font-bold">{{ emptyTitle() }}</p>
              @if (emptyText()) {
                <p class="z-muted mt-1 max-w-md mx-auto">{{ emptyText() }}</p>
              }
            </ng-template>
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
  readonly emptyTitle = input('Nothing here yet');
  readonly emptyText = input('');
  readonly retry = output<void>();
  protected readonly rows = [1, 2, 3];
}
