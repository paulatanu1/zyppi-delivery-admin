import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Page intro: title, one-line description and actions on the right. */
@Component({
  selector: 'z-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-end gap-4 mb-6">
      <div class="flex-1 min-w-[220px]">
        <h2 class="text-[22px]">{{ title() }}</h2>
        @if (subtitle()) {
          <p class="z-muted mt-1">{{ subtitle() }}</p>
        }
      </div>
      <ng-content />
    </div>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input('');
}
