import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { AuthService } from '../../core/auth/auth.service';
import { ROLE_LABELS, hasRole } from '../../core/auth/roles';
import { NAV } from '../../layout/nav';

/**
 * Phase A0 landing page. KPIs and charts arrive in A7 once the `stats/*`
 * counters exist; until then it shows the user's role and the roadmap.
 */
@Component({
  selector: 'z-dashboard',
  imports: [NzIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="z-brand rounded-[var(--z-radius-sheet)] p-6 md:p-10">
      <p class="text-[11px] font-extrabold tracking-[.08em] uppercase opacity-80">
        {{ roleLabel() }}
      </p>
      <h2 class="text-[28px] md:text-[34px] mt-2">{{ greeting() }}</h2>
      <p class="mt-2 opacity-85 max-w-xl">
        The new Zyppi admin is being built module by module. Modules you can use are live in the
        sidebar; the rest show when they’re coming.
      </p>
    </section>

    <h3 class="text-[17px] mt-8 mb-4">Your modules</h3>
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      @for (m of modules(); track m.label) {
        <div class="z-card p-5 flex items-start gap-4">
          <span class="icon"><span nz-icon [nzType]="m.icon"></span></span>
          <div class="min-w-0">
            <div class="font-extrabold">{{ m.label }}</div>
            <div class="z-caption mt-1">
              {{ m.link ? 'Live' : 'Phase ' + m.phase }}
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .icon {
      display: grid;
      place-items: center;
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: var(--z-radius-control);
      background: var(--z-brand-soft);
      color: var(--z-brand-text);
    }
  `,
})
export class Dashboard {
  private readonly auth = inject(AuthService);

  readonly roleLabel = computed(() => {
    const r = this.auth.role();
    return r ? ROLE_LABELS[r] : '';
  });

  readonly greeting = computed(() => {
    const h = new Date().getHours();
    const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const s = this.auth.session();
    const name = s?.displayName?.split(' ')[0];
    return name ? `${part}, ${name}` : part;
  });

  readonly modules = computed(() => {
    const role = this.auth.role();
    return NAV.flatMap((g) => g.items).filter(
      (i) => i.link !== '/dashboard' && hasRole(role, i.roles),
    );
  });
}
