import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
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
    NzAvatarModule,
    NzButtonModule,
    NzDrawerModule,
    NzDropdownModule,
    NzIconModule,
    NzMenuModule,
    NzTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="hidden lg:block fixed inset-y-0 left-0 w-[var(--z-sidebar-w)] z-20">
      <z-sidebar />
    </aside>

    <nz-drawer
      [nzVisible]="drawerOpen()"
      nzPlacement="left"
      [nzClosable]="false"
      [nzWidth]="264"
      [nzBodyStyle]="{ padding: '0' }"
      (nzOnClose)="drawerOpen.set(false)"
    >
      <ng-container *nzDrawerContent>
        <z-sidebar (navigate)="drawerOpen.set(false)" />
      </ng-container>
    </nz-drawer>

    <div class="lg:pl-[var(--z-sidebar-w)] min-h-full z-backdrop">
      <header
        class="topbar sticky top-0 z-10 flex items-center gap-2 px-4 md:px-8 h-[var(--z-topbar-h)]"
      >
        <button
          nz-button
          nzType="text"
          nzShape="circle"
          class="lg:!hidden"
          aria-label="Open menu"
          (click)="drawerOpen.set(true)"
        >
          <span nz-icon nzType="menu"></span>
        </button>
        <h1 class="text-[18px] flex-1 truncate">{{ title() }}</h1>
        <button
          nz-button
          nzType="text"
          nzShape="circle"
          nz-tooltip
          [nzTooltipTitle]="theme.isDark() ? 'Light theme' : 'Dark theme'"
          [attr.aria-label]="theme.isDark() ? 'Switch to light theme' : 'Switch to dark theme'"
          (click)="theme.toggle()"
        >
          <span nz-icon [nzType]="theme.isDark() ? 'sun' : 'moon'"></span>
        </button>
        <button
          type="button"
          class="user"
          nz-dropdown
          [nzDropdownMenu]="userMenu"
          nzTrigger="click"
          nzPlacement="bottomRight"
          aria-haspopup="menu"
        >
          <nz-avatar [nzText]="initial()" nzSize="small" class="avatar" />
          <span class="hidden sm:flex flex-col items-start leading-tight">
            <span class="font-bold text-[13px] max-w-[180px] truncate">{{ name() }}</span>
            <span class="z-caption">{{ roleLabel() }}</span>
          </span>
          <span nz-icon nzType="down" class="z-muted text-[11px]"></span>
        </button>
        <nz-dropdown-menu #userMenu="nzDropdownMenu">
          <ul nz-menu>
            <li nz-menu-item>
              <button type="button" class="menu-btn" (click)="signOut()">
                <span nz-icon nzType="logout"></span>
                <span class="ml-2">Sign out</span>
              </button>
            </li>
          </ul>
        </nz-dropdown-menu>
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
    .menu-btn {
      all: unset;
      display: flex;
      align-items: center;
      width: 100%;
      cursor: pointer;
    }
    .avatar {
      background: var(--z-brand);
      color: #fff;
      font-weight: 800;
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

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }

  private deepestTitle(): string {
    let r = this.route.snapshot;
    while (r.firstChild) r = r.firstChild;
    return (r.data['heading'] as string | undefined) ?? '';
  }
}
