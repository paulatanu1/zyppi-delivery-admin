import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { FormsModule } from '@angular/forms';
import { LoadStatus } from '../../core/firebase/live';
import { Chart, ChartOptions, axisStyle } from '../../shared/charts/chart';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { istDay } from '../reports/stats.models';
import { SearchInsightsApi } from './search-insights.api';
import {
  PERIODS,
  Period,
  SearchInsights,
  TrendDay,
  fillDays,
  share,
  totals,
} from './search-insights.models';

/** Catalog & growth → Search insights: what customers search for, and what they don't find. */
@Component({
  selector: 'z-search-insights-page',
  imports: [
    FormsModule,
    RouterLink,
    NzButtonModule,
    NzSegmentedModule,
    Chart,
    PageHeader,
    PageState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
    }
    .kpi b {
      display: block;
      font-size: 24px;
      font-variant-numeric: tabular-nums;
    }
    .bar {
      display: block;
      height: 8px;
      border-radius: 4px;
      background: var(--z-brand);
    }
    .bar.zero {
      background: var(--z-danger);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-variant-numeric: tabular-nums;
    }
    th {
      text-align: left;
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--z-ink-3);
      padding: 6px 8px;
      border-bottom: 1px solid var(--z-line);
    }
    td {
      padding: 8px;
      border-bottom: 1px solid var(--z-line);
    }
    td.n,
    th.n {
      text-align: right;
      white-space: nowrap;
    }
    .zero-text {
      color: var(--z-danger);
      font-weight: 700;
    }
    .wrap {
      overflow-x: auto;
    }
  `,
  template: `
    <z-page-header
      title="Search insights"
      subtitle="What customers search for in the app, and what they searched for but didn't find."
    >
      <nz-segmented
        [nzOptions]="periodOptions"
        [ngModel]="days()"
        (ngModelChange)="setDays($event)"
        aria-label="Period"
      />
    </z-page-header>

    <z-page-state
      [status]="status()"
      [error]="error()"
      [empty]="(data()?.top ?? []).length === 0"
      emptyTitle="No searches yet"
      emptyText="Searches appear here a few seconds after customers search in the app."
      (retry)="reload()"
    >
      @if (data(); as d) {
        <div class="flex flex-col gap-4">
          <div class="kpis">
            <div class="z-card p-4 kpi">
              <b>{{ sum().searches.toLocaleString('en-IN') }}</b>
              <span class="z-caption">Searches</span>
            </div>
            <div class="z-card p-4 kpi">
              <b>{{ d.top.length.toLocaleString('en-IN') }}{{ d.top.length >= 50 ? '+' : '' }}</b>
              <span class="z-caption">Different terms</span>
            </div>
            <div class="z-card p-4 kpi">
              <b class="zero-text">{{ sum().zeroPct }}%</b>
              <span class="z-caption"
                >Found nothing ({{ sum().zero.toLocaleString('en-IN') }})</span
              >
            </div>
          </div>

          <div class="z-card p-4">
            <h3 class="text-[15px] mb-2">Searches per day</h3>
            <z-chart [options]="trendChart()" [height]="220" label="Searches per day" />
          </div>

          <div class="z-card p-4">
            <h3 class="text-[15px] mb-2">Top search terms</h3>
            <div class="wrap">
              <table>
                <thead>
                  <tr>
                    <th>Term</th>
                    <th style="width: 40%"><span class="sr-only">Share</span></th>
                    <th class="n">Searches</th>
                    <th class="n">Found nothing</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of d.top.slice(0, 20); track r.term) {
                    <tr>
                      <td>{{ r.term }}</td>
                      <td>
                        <span class="bar" [style.width.%]="bar(r.count, d.top[0].count)"></span>
                      </td>
                      <td class="n">{{ r.count.toLocaleString('en-IN') }}</td>
                      <td class="n" [class.zero-text]="r.zeroCount > 0">{{ r.zeroCount }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <div class="z-card p-4">
            <div class="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <h3 class="text-[15px] m-0">Found nothing</h3>
              <span class="z-caption">Products customers want that the catalogue doesn't have</span>
            </div>
            @if (d.zeroResults.length === 0) {
              <p class="z-muted m-0">Every search found something in this period.</p>
            } @else {
              <div class="wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Term</th>
                      <th style="width: 40%"><span class="sr-only">Share</span></th>
                      <th class="n">Searches</th>
                      <th class="n"><span class="sr-only">Action</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of d.zeroResults.slice(0, 20); track r.term) {
                      <tr>
                        <td>{{ r.term }}</td>
                        <td>
                          <span
                            class="bar zero"
                            [style.width.%]="bar(r.zeroCount, d.zeroResults[0].zeroCount)"
                          ></span>
                        </td>
                        <td class="n zero-text">{{ r.zeroCount }}</td>
                        <td class="n">
                          <a nz-button nzType="link" nzSize="small" routerLink="/catalog/products"
                            >Add product</a
                          >
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        </div>
      }
    </z-page-state>
  `,
})
export class SearchInsightsPage {
  private readonly api = inject(SearchInsightsApi);

  readonly periodOptions = PERIODS.map((p) => ({ label: `${p} days`, value: p }));
  readonly days = signal<Period>(14);
  readonly status = signal<LoadStatus>('loading');
  readonly error = signal<string | null>(null);
  readonly data = signal<SearchInsights | null>(null);

  readonly trend = computed<TrendDay[]>(() =>
    fillDays(this.data()?.trend ?? [], this.days(), istDay()),
  );
  readonly sum = computed(() => totals(this.trend()));
  readonly trendChart = computed<ChartOptions>(() => {
    const rows = this.trend();
    return (p) => ({
      grid: { left: 8, right: 8, top: 28, bottom: 4, containLabel: true },
      legend: { top: 0, left: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10 },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: rows.map((r) => r.day.slice(5)),
        ...axisStyle(p),
        splitLine: { show: false },
      },
      yAxis: { type: 'value', minInterval: 1, ...axisStyle(p) },
      series: [
        {
          name: 'Searches',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          areaStyle: { opacity: 0.12, color: p.series[0] },
          lineStyle: { width: 2.5, color: p.series[0] },
          itemStyle: { color: p.series[0] },
          data: rows.map((r) => r.count),
        },
        {
          name: 'Found nothing',
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2, type: 'dashed', color: p.series[5] },
          itemStyle: { color: p.series[5] },
          data: rows.map((r) => r.zeroCount),
        },
      ],
    });
  });

  constructor() {
    void this.reload();
  }

  bar(value: number, max: number): number {
    return share(value, max);
  }

  setDays(days: Period): void {
    this.days.set(days);
    void this.reload();
  }

  async reload(): Promise<void> {
    this.status.set('loading');
    try {
      this.data.set(await this.api.load(this.days()));
      this.status.set('ready');
    } catch (e) {
      this.error.set((e as Error).message);
      this.status.set('error');
    }
  }
}
