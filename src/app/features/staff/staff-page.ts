import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { AuthService } from '../../core/auth/auth.service';
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, Role } from '../../core/auth/roles';
import { WhenPipe } from '../../shared/pipes/when.pipe';
import { PageHeader } from '../../shared/ui/page-header';
import { Confirm } from '../../shared/ui/confirm';
import { PageState } from '../../shared/ui/page-state';
import { StaffApi, StaffMember } from './staff.api';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Settings → Admins & roles (super_admin only). */
@Component({
  selector: 'z-staff-page',
  imports: [
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzIconModule,
    NzInputModule,
    NzModalModule,
    NzSelectModule,
    NzTableModule,
    NzTagModule,
    WhenPipe,
    PageHeader,
    PageState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './staff-page.html',
  styles: `
    .legend {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    }
    .table-card {
      overflow: hidden;
    }
  `,
})
export class StaffPage {
  private readonly api = inject(StaffApi);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(Confirm);
  private readonly toast = inject(NzMessageService);

  readonly staff = this.api.watchStaff();
  readonly me = computed(() => this.auth.session()?.uid);
  readonly roles = ROLES;
  readonly labels = ROLE_LABELS;
  readonly descriptions = ROLE_DESCRIPTIONS;
  readonly roleOptions = ROLES.map((r) => ({ label: ROLE_LABELS[r], value: r }));
  readonly busyUid = signal<string | null>(null);

  readonly addOpen = signal(false);
  readonly addEmail = signal('');
  readonly addRole = signal<Role>('ops');
  readonly addError = signal<string | null>(null);
  readonly adding = signal(false);
  readonly emailValid = computed(() => EMAIL.test(this.addEmail().trim()));

  labelOf(role: Role): string {
    return ROLE_LABELS[role];
  }

  /** Tag colour per role (NG-ZORRO preset colours). */
  color(role: Role): string {
    return {
      super_admin: 'purple',
      ops: 'blue',
      catalog: 'green',
      support: 'cyan',
      finance: 'gold',
    }[role];
  }

  openAdd(): void {
    this.addEmail.set('');
    this.addRole.set('ops');
    this.addError.set(null);
    this.addOpen.set(true);
  }

  async add(): Promise<void> {
    if (!this.emailValid()) return;
    this.adding.set(true);
    this.addError.set(null);
    try {
      await this.api.setRole(this.addEmail().trim(), this.addRole());
      this.toast.success(
        `${this.addEmail().trim()} is now ${ROLE_LABELS[this.addRole()]}. They need to sign in again.`,
      );
      this.addOpen.set(false);
    } catch (e) {
      this.addError.set((e as Error).message);
    } finally {
      this.adding.set(false);
    }
  }

  async changeRole(m: StaffMember, role: Role): Promise<void> {
    if (role === m.role) return;
    const ok = await this.confirm.ask({
      title: 'Change role?',
      content: `${m.email} becomes ${ROLE_LABELS[role]}: ${ROLE_DESCRIPTIONS[role]}.`,
      okText: 'Change role',
    });
    if (ok) await this.run(m, role, `${m.email} is now ${ROLE_LABELS[role]}`);
  }

  async remove(m: StaffMember): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Remove access?',
      content: `${m.email} loses admin access and is signed out within the hour. Their account itself is not deleted.`,
      okText: 'Remove access',
      danger: true,
    });
    if (ok) await this.run(m, null, `${m.email} no longer has access`);
  }

  private async run(m: StaffMember, role: Role | null, done: string): Promise<void> {
    this.busyUid.set(m.uid);
    try {
      await this.api.setRole(m.email, role);
      this.toast.success(done);
    } catch (e) {
      this.toast.error(`Not changed: ${(e as Error).message}`);
    } finally {
      this.busyUid.set(null);
    }
  }
}
