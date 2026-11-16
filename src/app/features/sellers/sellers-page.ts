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
import { SellerDrawer } from './seller-drawer';
import { SellersApi } from './sellers.api';
import {
  FULFILMENT_LABEL,
  MODEL_LABEL,
  STATUS_META,
  Seller,
  reliabilityPercent,
} from './sellers.models';

type Tab = 'review' | 'active' | 'other';
const TABS: Tab[] = ['review', 'active', 'other'];

/** Marketplace sellers: review applications, run accounts (docs/MARKETPLACE.md). */
@Component({
  selector: 'z-sellers-page',
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
    SellerDrawer,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sellers-page.html',
})
export class SellersPage {
  private readonly api = inject(SellersApi);
  private readonly db = inject(FIRESTORE);
  private readonly router = inject(Router);

  readonly id = input<string | undefined>();
  readonly sellers = this.api.watchAll();
  readonly tab = signal<Tab>('review');
  readonly search = signal('');
  readonly areaNames = signal(new Map<string, string>());
  readonly meta = STATUS_META;
  readonly modelLabel = MODEL_LABEL;
  readonly fulfilmentLabel = FULFILMENT_LABEL;
  readonly reliability = reliabilityPercent;

  readonly groups = computed(() => {
    const all = this.sellers.value() ?? [];
    const byName = (a: Seller, b: Seller) => a.shopName.localeCompare(b.shopName);
    return {
      review: all
        .filter((s) => s.status === 'applied')
        .sort((a, b) => (a.submittedAt?.toMillis() ?? 0) - (b.submittedAt?.toMillis() ?? 0)),
      active: all.filter((s) => s.status === 'approved').sort(byName),
      other: all.filter((s) => !['applied', 'approved'].includes(s.status)).sort(byName),
    };
  });

  readonly visible = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.groups()[this.tab()];
    return q
      ? list.filter(
          (s) =>
            s.shopName.toLowerCase().includes(q) ||
            s.ownerName.toLowerCase().includes(q) ||
            s.phone.includes(q),
        )
      : list;
  });

  readonly owed = computed(() =>
    this.groups().active.reduce((t, s) => t + s.earningsBalancePaise + s.heldPaise, 0),
  );
  readonly dues = computed(() => this.groups().active.reduce((t, s) => t + s.duesPaise, 0));
  readonly tabIndex = computed(() => TABS.indexOf(this.tab()));

  constructor() {
    void getDocs(collection(this.db, 'serviceAreas'))
      .then((s) =>
        this.areaNames.set(new Map(s.docs.map((d) => [d.id, (d.get('name') as string) ?? d.id]))),
      )
      .catch(() => undefined);
  }

  setTab(i: number): void {
    this.tab.set(TABS[i]);
  }

  open(s: Seller): void {
    void this.router.navigate(['/sellers', s.id]);
  }

  close(): void {
    void this.router.navigate(['/sellers']);
  }
}
