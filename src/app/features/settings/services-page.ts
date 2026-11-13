import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { allReady } from '../../core/firebase/live';
import { WhenPipe } from '../../shared/pipes/when.pipe';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { StaffApi } from '../staff/staff.api';
import {
  FeaturesPatch,
  MAX_MAINTENANCE_MESSAGE,
  SERVICE_SWITCHES,
  ServiceSwitch,
  VERSION_PATTERN,
  switchPatch,
  switchValue,
} from './features.model';
import { SettingsApi } from './settings.api';

/**
 * Settings → Services: kill switches for costly services, maintenance mode,
 * paused areas and the minimum app version (config/features via
 * adminUpdateFeatures). Functions pick changes up within a minute.
 */
@Component({
  selector: 'z-services-page',
  imports: [
    FormsModule,
    ButtonModule,
    InputTextModule,
    MultiSelectModule,
    TagModule,
    TextareaModule,
    ToggleSwitchModule,
    WhenPipe,
    PageHeader,
    PageState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './services-page.html',
  styleUrl: './services-page.scss',
})
export class ServicesPage {
  private readonly api = inject(SettingsApi);
  private readonly confirm = inject(ConfirmationService);
  private readonly toast = inject(MessageService);

  readonly features = this.api.watchFeatures();
  readonly areas = this.api.watchServiceAreas();
  readonly staff = inject(StaffApi).watchStaff();
  readonly status = allReady(this.features, this.areas);

  readonly switches = SERVICE_SWITCHES;
  readonly maxMessage = MAX_MAINTENANCE_MESSAGE;
  /** Which control is saving: a switch id or 'maintenance' | 'areas' | 'version'. */
  readonly saving = signal<string | null>(null);

  // Drafts for the fields saved with a button; reset from the server value.
  readonly message = signal('');
  readonly closedAreas = signal<string[]>([]);
  readonly version = signal('');

  readonly value = computed(() => this.features.value());
  readonly offCount = computed(() => {
    const f = this.value();
    return f ? this.switches.filter((s) => !switchValue(f, s.id)).length : 0;
  });
  readonly updatedByEmail = computed(() => {
    const by = this.value()?.updatedBy;
    if (!by) return null;
    return this.staff.value()?.find((m) => m.uid === by)?.email ?? 'a staff member';
  });
  readonly areaOptions = computed(() =>
    (this.areas.value() ?? []).map((a) => ({
      label: a.isActive ? a.name : `${a.name} (inactive)`,
      value: a.id,
    })),
  );
  readonly messageDirty = computed(
    () => this.message().trim() !== (this.value()?.maintenance.message ?? ''),
  );
  readonly areasDirty = computed(() => {
    const a = [...this.closedAreas()].sort().join();
    return a !== [...(this.value()?.closedAreaIds ?? [])].sort().join();
  });
  readonly versionValid = computed(() => !this.version() || VERSION_PATTERN.test(this.version()));
  readonly versionDirty = computed(
    () => (this.version().trim() || null) !== (this.value()?.minAppVersion ?? null),
  );

  constructor() {
    effect(() => {
      const f = this.value();
      if (!f) return;
      this.message.set(f.maintenance.message);
      this.closedAreas.set([...f.closedAreaIds]);
      this.version.set(f.minAppVersion ?? '');
    });
  }

  isOn(s: ServiceSwitch): boolean {
    const f = this.value();
    return f ? switchValue(f, s.id) : true;
  }

  toggle(s: ServiceSwitch): void {
    if (this.saving()) return;
    const turnOn = !this.isOn(s);
    this.confirm.confirm({
      header: `${turnOn ? 'Turn on' : 'Turn off'} ${s.title}?`,
      message: turnOn ? 'Customers get this back within a minute.' : `${s.whenOff}`,
      icon: turnOn ? 'pi pi-check-circle' : 'pi pi-exclamation-triangle',
      acceptLabel: turnOn ? 'Turn on' : 'Turn off',
      rejectLabel: 'Cancel',
      acceptButtonProps: { severity: turnOn ? 'primary' : 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () =>
        this.save(s.id, switchPatch(s.id, turnOn), `${s.title} turned ${turnOn ? 'on' : 'off'}`),
    });
  }

  toggleMaintenance(): void {
    const on = !this.value()?.maintenance.enabled;
    this.confirm.confirm({
      header: on ? 'Start maintenance mode?' : 'End maintenance mode?',
      message: on
        ? 'Every new order and payment is refused until you turn it off. Customers see your message.'
        : 'Customers can order again within a minute.',
      icon: on ? 'pi pi-exclamation-triangle' : 'pi pi-check-circle',
      acceptLabel: on ? 'Start maintenance' : 'End maintenance',
      rejectLabel: 'Cancel',
      acceptButtonProps: { severity: on ? 'danger' : 'primary' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () =>
        this.save(
          'maintenance',
          { maintenance: { enabled: on, message: this.message().trim() } },
          on ? 'Maintenance mode is on' : 'Maintenance mode is off',
        ),
    });
  }

  saveMessage(): void {
    void this.save(
      'maintenance',
      { maintenance: { message: this.message().trim() } },
      'Message saved',
    );
  }

  saveAreas(): void {
    void this.save('areas', { closedAreaIds: this.closedAreas() }, 'Paused areas saved');
  }

  saveVersion(): void {
    if (!this.versionValid()) return;
    void this.save(
      'version',
      { minAppVersion: this.version().trim() || null },
      'Minimum app version saved',
    );
  }

  private async save(key: string, patch: FeaturesPatch, done: string): Promise<void> {
    this.saving.set(key);
    try {
      await this.api.updateFeatures(patch);
      this.toast.add({ severity: 'success', summary: done, detail: 'Live within a minute.' });
    } catch (e) {
      this.toast.add({ severity: 'error', summary: 'Not saved', detail: (e as Error).message });
    } finally {
      this.saving.set(null);
    }
  }

  retry(): void {
    this.features.retry();
    this.areas.retry();
  }
}
