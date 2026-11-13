import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

/** Forbidden / not-found, driven by route data. */
@Component({
  selector: 'z-status-page',
  imports: [RouterLink, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-[60vh] grid place-items-center text-center p-6">
      <div class="max-w-sm">
        <div class="badge"><i [class]="data['icon']"></i></div>
        <h2 class="text-[24px] mt-6">{{ data['heading'] }}</h2>
        <p class="z-muted mt-2">{{ data['message'] }}</p>
        <p-button label="Go to dashboard" routerLink="/" styleClass="mt-6" />
      </div>
    </div>
  `,
  styles: `
    .badge {
      display: inline-grid;
      place-items: center;
      width: 72px;
      height: 72px;
      border-radius: 24px;
      background: var(--z-brand-soft);
      color: var(--z-brand-text);
      font-size: 28px;
    }
  `,
})
export class StatusPage {
  protected readonly data = inject(ActivatedRoute).snapshot.data;
}
