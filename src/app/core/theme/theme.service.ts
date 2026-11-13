import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';

const KEY = 'zyppi-admin.theme';

/**
 * Light / dark / system. Dark = the `.z-dark` class on <html> (our tokens)
 * plus the NG-ZORRO `theme-dark.css` bundle in <link id="z-theme">.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);
  private readonly media = this.doc.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly systemDark = signal(this.media?.matches ?? false);

  readonly mode = signal<ThemeMode>(readMode());
  readonly isDark = computed(() =>
    this.mode() === 'system' ? this.systemDark() : this.mode() === 'dark',
  );

  constructor() {
    this.media?.addEventListener('change', (e) => this.systemDark.set(e.matches));
    effect(() => {
      const dark = this.isDark();
      this.doc.documentElement.classList.toggle('z-dark', dark);
      const link = this.doc.getElementById('z-theme');
      const href = dark ? 'theme-dark.css' : 'theme-light.css';
      if (link && link.getAttribute('href') !== href) link.setAttribute('href', href);
      try {
        localStorage.setItem(KEY, this.mode());
      } catch {
        // Storage blocked (private window): the choice lasts for this tab only.
      }
    });
  }

  toggle(): void {
    this.mode.set(this.isDark() ? 'light' : 'dark');
  }
}

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}
