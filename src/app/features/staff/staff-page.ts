import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { AuthService } from '../../core/auth/auth.service';
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, Role } from '../../core/auth/roles';
import { WhenPipe } from '../../shared/pipes/when.pipe';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { StaffApi, StaffMember } from './staff.api';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Settings → Admins & roles (super_admin only). */
@Component({
  selector: 'z-staff-page',
  imports: [
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TableModule,
    TagModule,
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
    :host ::ng-deep .p-datatable {
      border-radius: var(--z-radius-card);
      overflow: hidden;
    }
  `,
})
export class StaffPage {
  private readonly api = inject(StaffApi);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmationService);
  private readonly toast = inject(MessageService);

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

  severity(role: Role): 'danger' | 'info' | 'success' | 'warn' | 'secondary' {
    return role === 'super_admin'
      ? 'danger'
      : role === 'ops'
        ? 'info'
        : role === 'catalog'
          ? 'success'
          : role === 'finance'
            ? 'warn'
            : 'secondary';
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
      this.toast.add({
        severity: 'success',
        summary: 'Access granted',
        detail: `${this.addEmail().trim()} is now ${ROLE_LABELS[this.addRole()]}. They need to sign in again.`,
      });
      this.addOpen.set(false);
    } catch (e) {
      this.addError.set((e as Error).message);
    } finally {
      this.adding.set(false);
    }
  }

  changeRole(m: StaffMember, role: Role): void {
    if (role === m.role) return;
    this.confirm.confirm({
      header: 'Change role?',
      message: `${m.email} becomes ${ROLE_LABELS[role]}: ${ROLE_DESCRIPTIONS[role]}.`,
      icon: 'pi pi-shield',
      acceptLabel: 'Change role',
      rejectLabel: 'Cancel',
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.run(m, role, `${m.email} is now ${ROLE_LABELS[role]}`),
    });
  }

  remove(m: StaffMember): void {
    this.confirm.confirm({
      header: 'Remove access?',
      message: `${m.email} loses admin access and is signed out within the hour. Their account itself is not deleted.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Remove access',
      rejectLabel: 'Cancel',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.run(m, null, `${m.email} no longer has access`),
    });
  }

  private async run(m: StaffMember, role: Role | null, done: string): Promise<void> {
    this.busyUid.set(m.uid);
    try {
      await this.api.setRole(m.email, role);
      this.toast.add({ severity: 'success', summary: done });
    } catch (e) {
      this.toast.add({ severity: 'error', summary: 'Not changed', detail: (e as Error).message });
    } finally {
      this.busyUid.set(null);
    }
  }
}
