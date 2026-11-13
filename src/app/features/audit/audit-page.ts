import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { QueryDocumentSnapshot } from 'firebase/firestore';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { ROLE_LABELS, isRole } from '../../core/auth/roles';
import { LoadStatus, friendlyFirestoreError } from '../../core/firebase/live';
import { WhenPipe } from '../../shared/pipes/when.pipe';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { ACTION_LABELS, AuditApi, AuditRow, Change, diff } from './audit.api';

interface Entry extends AuditRow {
  changes: Change[];
}

/** Settings → Audit log (super_admin only): append-only record of admin changes. */
@Component({
  selector: 'z-audit-page',
  imports: [
    FormsModule,
    NzButtonModule,
    NzIconModule,
    NzSelectModule,
    NzTagModule,
    WhenPipe,
    PageHeader,
    PageState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <z-page-header
      title="Audit log"
      subtitle="Every change made through this panel: who, when, and what it was before and after. Nobody can edit or delete it."
    >
      <nz-select
        [nzOptions]="actionOptions"
        [ngModel]="action()"
        (ngModelChange)="setAction($event)"
        nzPlaceHolder="All actions"
        [nzAllowClear]="true"
        aria-label="Filter by action"
        class="min-w-[240px]"
      />
    </z-page-header>

    <z-page-state
      [status]="status()"
      [error]="error()"
      [empty]="entries().length === 0"
      emptyTitle="No changes recorded yet"
      (retry)="reload()"
    >
      <ol class="flex flex-col gap-3 list-none p-0 m-0">
        @for (e of entries(); track e.id) {
          <li class="z-card p-4 md:p-5">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span class="font-extrabold">{{ label(e.action) }}</span>
              <nz-tag>{{ roleLabel(e.role) }}</nz-tag>
              <span class="z-caption ml-auto">{{ e.at | when }}</span>
            </div>
            <div class="z-caption mt-1">
              by {{ e.actorEmail || e.actorUid }} · <code>{{ e.target }}</code>
            </div>
            @if (e.changes.length) {
              <div class="changes mt-3">
                @for (c of e.changes; track c.path) {
                  <div class="path">{{ c.path }}</div>
                  <div class="before">{{ c.before }}</div>
                  <span
                    nz-icon
                    nzType="arrow-right"
                    class="z-muted text-xs"
                    aria-label="changed to"
                  ></span>
                  <div class="after">{{ c.after }}</div>
                }
              </div>
            }
          </li>
        }
      </ol>
      @if (cursor()) {
        <div class="flex justify-center mt-6">
          <button nz-button [nzLoading]="loadingMore()" (click)="more()">Load older</button>
        </div>
      }
    </z-page-state>
  `,
  styles: `
    .changes {
      display: grid;
      grid-template-columns: minmax(120px, max-content) minmax(0, 1fr) auto minmax(0, 1fr);
      align-items: center;
      gap: 6px 12px;
      font-size: 13px;
      padding: 12px;
      border-radius: var(--z-radius-control);
      background: var(--z-surface-2);
    }
    .path {
      font-weight: 800;
    }
    .before,
    .after {
      overflow-wrap: anywhere;
    }
    .before {
      color: var(--z-danger);
      text-decoration: line-through;
    }
    .after {
      color: var(--z-ok);
      font-weight: 700;
    }
    code {
      font-size: 12px;
    }
  `,
})
export class AuditPage {
  private readonly api = inject(AuditApi);

  readonly status = signal<LoadStatus>('loading');
  readonly error = signal<string | null>(null);
  readonly entries = signal<Entry[]>([]);
  readonly cursor = signal<QueryDocumentSnapshot | null>(null);
  readonly loadingMore = signal(false);
  readonly action = signal<string | null>(null);
  readonly actionOptions = Object.entries(ACTION_LABELS).map(([value, label]) => ({
    label,
    value,
  }));

  constructor() {
    void this.reload();
  }

  label(action: string): string {
    return ACTION_LABELS[action] ?? action;
  }

  roleLabel(role: string): string {
    return isRole(role) ? ROLE_LABELS[role] : role;
  }

  setAction(action: string | null): void {
    this.action.set(action ?? null);
    void this.reload();
  }

  async reload(): Promise<void> {
    this.status.set('loading');
    try {
      const page = await this.api.page(this.action(), null);
      this.entries.set(page.rows.map(withChanges));
      this.cursor.set(page.cursor);
      this.status.set('ready');
    } catch (e) {
      this.error.set(friendlyFirestoreError(e));
      this.status.set('error');
    }
  }

  async more(): Promise<void> {
    this.loadingMore.set(true);
    try {
      const page = await this.api.page(this.action(), this.cursor());
      this.entries.update((rows) => [...rows, ...page.rows.map(withChanges)]);
      this.cursor.set(page.cursor);
    } finally {
      this.loadingMore.set(false);
    }
  }
}

function withChanges(row: AuditRow): Entry {
  return { ...row, changes: diff(row.before, row.after) };
}
