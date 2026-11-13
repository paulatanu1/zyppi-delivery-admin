import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { MenuModule } from 'primeng/menu';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { filter, map } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { ROLE_LABELS } from '../core/auth/roles';
import { ThemeService } from '../core/theme/theme.service';
import { Sidebar } from './sidebar';

@Component({
  selector: 'z-shell',
  imports: [
    RouterOutlet,
    Sidebar,
    ButtonModule,
    DrawerModule,
    MenuModule,
    AvatarModule,
    TagModule,
    TooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="hidden lg:block fixed inset-y-0 left-0 w-[var(--z-sidebar-w)] z-20">
      <z-sidebar />
    </aside>

    <p-drawer [(visible)]="drawerOpen" [showCloseIcon]="false" styleClass="!w-[var(--z-sidebar-w)]">
      <ng-template #headless>
        <z-sidebar (navigate)="drawerOpen.set(false)" />
      </ng-template>
    </p-drawer>

    <div class="lg:pl-[var(--z-sidebar-w)] min-h-full z-backdrop">
      <header
        class="topbar sticky top-0 z-10 flex items-center gap-2 px-4 md:px-8 h-[var(--z-topbar-h)]"
      >
        <p-button
          class="lg:hidden"
          icon="pi pi-bars"
          [text]="true"
          [rounded]="true"
          severity="secondary"
          ariaLabel="Open menu"
          (onClick)="drawerOpen.set(true)"
        />
        <h1 class="text-[18px] flex-1 truncate">{{ title() }}</h1>
        <p-button
          [icon]="theme.isDark() ? 'pi pi-sun' : 'pi pi-moon'"
          [text]="true"
          [rounded]="true"
          severity="secondary"
          [pTooltip]="theme.isDark() ? 'Light theme' : 'Dark theme'"
          tooltipPosition="bottom"
          [ariaLabel]="theme.isDark() ? 'Switch to light theme' : 'Switch to dark theme'"
          (onClick)="theme.toggle()"
        />
        <button type="button" class="user" (click)="menu.toggle($event)" aria-haspopup="menu">
          <p-avatar
            [label]="initial()"
            shape="circle"
            styleClass="!bg-[var(--z-brand)] !text-white"
          />
          <span class="hidden sm:flex flex-col items-start leading-tight">
            <span class="font-bold text-[13px] max-w-[180px] truncate">{{ name() }}</span>
            <span class="z-caption">{{ roleLabel() }}</span>
          </span>
          <i class="pi pi-angle-down z-muted text-xs"></i>
        </button>
        <p-menu #menu [model]="menuItems" [popup]="true" appendTo="body" />
      </header>

      <main class="px-4 md:px-8 py-6 max-w-[1440px] mx-auto">
        <router-outlet />
      </main>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100%;
    }
    .topbar {
      background: color-mix(in srgb, var(--z-bg) 78%, transparent);
      backdrop-filter: blur(14px);
      border-bottom: 1px solid var(--z-line);
    }
    .user {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 4px 10px 4px 4px;
      border: 1px solid var(--z-line);
      border-radius: 999px;
      background: var(--z-surface);
      color: var(--z-ink);
      cursor: pointer;
      font: inherit;
    }
    .user:hover {
      border-color: var(--z-line-2);
    }
  `,
})
export class Shell {
  protected readonly theme = inject(ThemeService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly drawerOpen = signal(false);

  readonly title = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.deepestTitle()),
    ),
    { initialValue: this.deepestTitle() },
  );

  readonly name = computed(() => {
    const s = this.auth.session();
    return s?.displayName || s?.email || 'Admin';
  });
  readonly initial = computed(() => this.name().charAt(0).toUpperCase());
  readonly roleLabel = computed(() => {
    const role = this.auth.role();
    return role ? ROLE_LABELS[role] : '';
  });

  readonly menuItems: MenuItem[] = [
    {
      label: 'Sign out',
      icon: 'pi pi-sign-out',
      command: async () => {
        await this.auth.signOut();
        await this.router.navigateByUrl('/login');
      },
    },
  ];

  private deepestTitle(): string {
    let r = this.route.snapshot;
    while (r.firstChild) r = r.firstChild;
    return (r.data['heading'] as string | undefined) ?? '';
  }
}
