import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideNzConfig } from 'ng-zorro-antd/core/config';
import { provideNzNativeDateAdapter } from 'ng-zorro-antd/core/time';
import { en_GB, provideNzI18n } from 'ng-zorro-antd/i18n';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { NzModalService } from 'ng-zorro-antd/modal';
import { routes } from './app.routes';
import { provideFirebase } from './core/firebase/firebase';
import { ICONS } from './core/theme/icons';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    provideFirebase(),
    provideNzI18n(en_GB),
    provideNzIcons(ICONS),
    // Not root-provided in NG-ZORRO 22; shared by the Confirm helper.
    NzModalService,
    // NG-ZORRO 22 date pickers need an adapter (Reports range picker);
    // without it the page throws NG0201 and renders blank.
    provideNzNativeDateAdapter(),
    provideNzConfig({
      message: { nzTop: 72, nzDuration: 3500 },
      notification: { nzPlacement: 'topRight' },
      modal: { nzMaskClosable: false },
    }),
  ],
};
