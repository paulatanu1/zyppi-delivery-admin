import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { hasRole } from '../core/auth/roles';
import { NAV } from './nav';

@Component({
  selector: 'z-sidebar',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="z-brand flex items-center gap-3 px-5 h-[var(--z-topbar-h)] shrink-0">
      <div class="logo z-display">Z</div>
      <div class="leading-tight">
        <div class="z-display text-[17px]">Zyppi</div>
        <div class="text-[11px] font-bold tracking-[.08em] uppercase opacity-80">Admin</div>
      </div>
    </div>
    <nav class="flex-1 overflow-y-auto px-3 py-4" aria-label="Main">
      @for (group of groups(); track group.label) {
        <div class="z-overline px-3 pt-4 pb-2">{{ group.label }}</div>
        @for (item of group.items; track item.label) {
          @if (item.link) {
            <a
              class="item"
              [routerLink]="item.link"
              routerLinkActive="active"
              (click)="navigate.emit()"
            >
              <i [class]="item.icon"></i>
              <span>{{ item.label }}</span>
            </a>
          } @else {
            <span class="item disabled" [attr.title]="'Coming in phase ' + item.phase">
              <i [class]="item.icon"></i>
              <span class="flex-1">{{ item.label }}</span>
              <span class="soon">Soon</span>
            </span>
          }
        }
      }
    </nav>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--z-surface);
      border-right: 1px solid var(--z-line);
    }
    .logo {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: var(--z-radius-control);
      background: rgb(255 255 255 / 16%);
      border: 1px solid rgb(255 255 255 / 24%);
      font-size: 18px;
    }
    .item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      margin: 2px 0;
      border-radius: var(--z-radius-control);
      color: var(--z-ink-2);
      font-weight: 700;
      text-decoration: none;
      transition:
        background 0.15s,
        color 0.15s;
    }
    .item i {
      font-size: 16px;
    }
    a.item:hover {
      background: var(--z-surface-2);
      color: var(--z-ink);
    }
    a.item.active {
      background: var(--z-brand-soft);
      color: var(--z-brand-text);
    }
    .item.disabled {
      opacity: 0.55;
      cursor: default;
    }
    .soon {
      font-size: 10px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: var(--z-radius-badge);
      background: var(--z-surface-2);
      color: var(--z-ink-3);
    }
  `,
})
export class Sidebar {
  private readonly auth = inject(AuthService);
  readonly navigate = output<void>();

  readonly groups = computed(() => {
    const role = this.auth.role();
    return NAV.map((g) => ({
      ...g,
      items: g.items.filter((i) => hasRole(role, i.roles)),
    })).filter((g) => g.items.length > 0);
  });
}
