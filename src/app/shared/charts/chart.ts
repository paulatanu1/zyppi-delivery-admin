import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { EChartsCoreOption } from 'echarts/core';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
import { ThemeService } from '../../core/theme/theme.service';

/** Colours for charts, read from the --z-* tokens of the current theme. */
export interface ChartPalette {
  series: string[];
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  surface: string;
  font: string;
  /** False when the user asked for reduced motion. */
  animate: boolean;
}

export type ChartOptions = (p: ChartPalette) => EChartsCoreOption;

function readPalette(doc: Document): ChartPalette {
  const css = doc.defaultView?.getComputedStyle(doc.documentElement);
  const v = (name: string) => css?.getPropertyValue(name).trim() || 'currentColor';
  return {
    series: [
      v('--z-brand'),
      v('--z-blue'),
      v('--z-ok'),
      v('--z-warn'),
      v('--z-tone-aurora'),
      v('--z-danger'),
      v('--z-tone-deep'),
      v('--z-deal'),
    ],
    ink: v('--z-ink'),
    ink2: v('--z-ink-2'),
    ink3: v('--z-ink-3'),
    line: v('--z-line'),
    surface: v('--z-surface'),
    font: css?.getPropertyValue('--font-sans').trim() || 'sans-serif',
    animate: !doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  };
}

/**
 * An ECharts chart that follows the light/dark theme. Pass a function of
 * the palette; it re-runs when the theme changes. ECharts loads on the
 * first chart only.
 */
@Component({
  selector: 'z-chart',
  imports: [NgxEchartsDirective],
  providers: [
    provideEchartsCore({ echarts: () => import('./echarts-setup').then((m) => m.default) }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div
    echarts
    [options]="resolved()"
    [autoResize]="true"
    [style.height.px]="height()"
    role="img"
    [attr.aria-label]="label()"
  ></div>`,
})
export class Chart {
  private readonly doc = inject(DOCUMENT);
  private readonly theme = inject(ThemeService);

  readonly options = input.required<ChartOptions>();
  readonly height = input(260);
  /** What the chart shows, for screen readers. */
  readonly label = input('Chart');

  protected readonly resolved = computed(() => {
    this.theme.isDark(); // re-read the tokens when the theme flips
    const p = readPalette(this.doc);
    const o = this.options()(p) as Record<string, unknown>;
    return {
      color: p.series,
      backgroundColor: 'transparent',
      animation: p.animate,
      textStyle: { color: p.ink2, fontFamily: p.font },
      ...o,
      tooltip: {
        backgroundColor: p.surface,
        borderColor: p.line,
        textStyle: { color: p.ink, fontFamily: p.font },
        ...(o['tooltip'] as object | undefined),
      },
      legend: o['legend']
        ? { textStyle: { color: p.ink2 }, ...(o['legend'] as object) }
        : undefined,
    } as EChartsCoreOption;
  });
}

/** Axis styling shared by the line and bar charts. */
export function axisStyle(p: ChartPalette) {
  return {
    axisLine: { lineStyle: { color: p.line } },
    axisTick: { show: false },
    axisLabel: { color: p.ink3 },
    splitLine: { lineStyle: { color: p.line, type: 'dashed' as const } },
  };
}
