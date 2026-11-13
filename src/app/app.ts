import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { ThemeService } from './core/theme/theme.service';

@Component({
  selector: 'z-root',
  imports: [RouterOutlet, ToastModule, ConfirmDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    <p-toast position="top-right" />
    <p-confirmdialog />
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
  `,
})
export class App {
  // Instantiated at startup so the saved theme is applied and kept in sync.
  protected readonly theme = inject(ThemeService);
}
