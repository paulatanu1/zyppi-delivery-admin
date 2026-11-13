import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzResultModule } from 'ng-zorro-antd/result';

/** Forbidden / not-found, driven by route data (`status`: 403 | 404). */
@Component({
  selector: 'z-status-page',
  imports: [RouterLink, NzButtonModule, NzResultModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nz-result
      [nzStatus]="data['status']"
      [nzTitle]="data['heading']"
      [nzSubTitle]="data['message']"
    >
      <div nz-result-extra>
        <a nz-button nzType="primary" routerLink="/">Go to dashboard</a>
      </div>
    </nz-result>
  `,
})
export class StatusPage {
  protected readonly data = inject(ActivatedRoute).snapshot.data;
}
