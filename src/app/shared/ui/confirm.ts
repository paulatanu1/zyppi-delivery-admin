import { Injectable, inject } from '@angular/core';
import { NzModalService } from 'ng-zorro-antd/modal';

export interface ConfirmOptions {
  title: string;
  content: string;
  okText: string;
  danger?: boolean;
}

/** Promise-based confirm dialog (NG-ZORRO modal). Resolves true on OK. */
@Injectable({ providedIn: 'root' })
export class Confirm {
  private readonly modal = inject(NzModalService);

  ask(o: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      this.modal.confirm({
        nzTitle: o.title,
        nzContent: o.content,
        nzOkText: o.okText,
        nzOkDanger: o.danger ?? false,
        nzCancelText: 'Cancel',
        nzCentered: true,
        nzOnOk: () => resolve(true),
        nzOnCancel: () => resolve(false),
      });
    });
  }
}
