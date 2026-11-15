import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { collection, getDocs } from 'firebase/firestore';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { FIRESTORE } from '../../core/firebase/firebase';
import { RupeesPipe } from '../../shared/pipes/rupees.pipe';
import { WhenPipe } from '../../shared/pipes/when.pipe';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { RiderDrawer } from './rider-drawer';
import { RidersApi } from './riders.api';
import { Rider, STATUS_META, onTimePercent, vehicleLabel } from './riders.models';

type Tab = 'review' | 'active' | 'other';

@Component({
  selector: 'z-riders-page',
  imports: [
    FormsModule,
    NzBadgeModule,
    NzIconModule,
    NzInputModule,
    NzTableModule,
    NzTabsModule,
    NzTagModule,
    RupeesPipe,
    WhenPipe,
    PageHeader,
    PageState,
    RiderDrawer,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './riders-page.html',
})
export class RidersPage {
  private readonly api = inject(RidersApi);
  private readonly db = inject(FIRESTORE);
  private readonly router = inject(Router);

  readonly id = input<string | undefined>();
  readonly riders = this.api.watchAll();
  readonly tab = signal<Tab>('review');
  readonly search = signal('');
  readonly areaNames = signal(new Map<string, string>());
  readonly meta = STATUS_META;
  readonly vehicle = vehicleLabel;
  readonly onTime = onTimePercent;
  readonly portalUrl = `${location.origin}/rider`;

  readonly groups = computed(() => {
    const all = this.riders.value() ?? [];
    return {
      review: all
        .filter((r) => r.status === 'submitted')
        .sort((a, b) => (a.submittedAt?.toMillis() ?? 0) - (b.submittedAt?.toMillis() ?? 0)),
      active: all
        .filter((r) => r.status === 'approved')
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
      other: all
        .filter((r) => !['submitted', 'approved'].includes(r.status))
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    };
  });

  readonly visible = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.groups()[this.tab()];
    return q
      ? list.filter(
          (r) =>
            r.fullName.toLowerCase().includes(q) ||
            r.phone.includes(q) ||
            r.vehicleNumber.toLowerCase().includes(q),
        )
      : list;
  });

  readonly cashHeld = computed(() =>
    this.groups().active.reduce((s, r) => s + r.codBalancePaise, 0),
  );

  readonly tabIndex = computed(() => ['review', 'active', 'other'].indexOf(this.tab()));

  constructor() {
    void getDocs(collection(this.db, 'serviceAreas'))
      .then((s) =>
        this.areaNames.set(new Map(s.docs.map((d) => [d.id, (d.get('name') as string) ?? d.id]))),
      )
      .catch(() => undefined);
  }

  setTab(i: number): void {
    this.tab.set((['review', 'active', 'other'] as Tab[])[i]);
  }

  open(r: Rider): void {
    void this.router.navigate(['/riders', r.uid]);
  }

  close(): void {
    void this.router.navigate(['/riders']);
  }

  copyPortal(): void {
    void navigator.clipboard?.writeText(this.portalUrl);
  }
}
