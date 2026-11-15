import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { QueryDocumentSnapshot } from 'firebase/firestore';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { LoadStatus, friendlyFirestoreError } from '../../core/firebase/live';
import { RupeesPipe } from '../../shared/pipes/rupees.pipe';
import { WhenPipe } from '../../shared/pipes/when.pipe';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { CustomerDrawer } from './customer-drawer';
import { CustomersApi } from './customers.api';
import { Customer, customerName, parseCustomerQuery } from './customers.models';

/** Customers: newest sign-ups, or search by phone, email, name or order number. */
@Component({
  selector: 'z-customers-page',
  imports: [
    CustomerDrawer,
    FormsModule,
    NzButtonModule,
    NzIconModule,
    NzInputModule,
    NzTableModule,
    NzTagModule,
    PageHeader,
    PageState,
    RupeesPipe,
    WhenPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customers-page.html',
})
export class CustomersPage {
  private readonly api = inject(CustomersApi);
  private readonly router = inject(Router);

  /** Route param :id opens the drawer. */
  readonly id = input<string | undefined>();

  readonly name = customerName;
  readonly search = signal('');
  readonly searching = signal(false);
  readonly status = signal<LoadStatus>('loading');
  readonly error = signal<string | null>(null);
  readonly rows = signal<Customer[]>([]);
  readonly loadingMore = signal(false);
  private cursor: QueryDocumentSnapshot | null = null;
  readonly hasMore = signal(false);

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.status.set('loading');
    this.error.set(null);
    try {
      const q = parseCustomerQuery(this.search());
      this.searching.set(q.kind !== 'none');
      if (q.kind === 'none') {
        const p = await this.api.page(null);
        this.rows.set(p.customers);
        this.cursor = p.cursor;
        this.hasMore.set(!!p.cursor);
      } else {
        this.rows.set(await this.api.search(q));
        this.cursor = null;
        this.hasMore.set(false);
      }
      this.status.set('ready');
    } catch (e) {
      this.error.set(friendlyFirestoreError(e));
      this.status.set('error');
    }
  }

  async more(): Promise<void> {
    if (!this.cursor) return;
    this.loadingMore.set(true);
    try {
      const p = await this.api.page(this.cursor);
      this.rows.update((r) => [...r, ...p.customers]);
      this.cursor = p.cursor;
      this.hasMore.set(!!p.cursor);
    } finally {
      this.loadingMore.set(false);
    }
  }

  clear(): void {
    this.search.set('');
    void this.reload();
  }

  open(c: Customer): void {
    void this.router.navigate(['/customers', c.id]);
  }

  closeDrawer(): void {
    void this.router.navigate(['/customers']);
  }
}
