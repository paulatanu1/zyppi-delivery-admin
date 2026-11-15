import { ChartOptions, axisStyle } from '../../shared/charts/chart';
import { formatPaise } from '../../shared/pipes/rupees.pipe';
import { DayStats, Grain, HOURS, METHOD_LABELS, bucketLabel } from './stats.models';

const grid = { left: 8, right: 8, top: 36, bottom: 4, containLabel: true };

/** Orders (bars) and GMV (line) per period. */
export function ordersGmvChart(rows: DayStats[], grain: Grain): ChartOptions {
  return (p) => ({
    grid,
    legend: { top: 0, left: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: rows.map((r) => bucketLabel(r.date, grain)),
      ...axisStyle(p),
      splitLine: { show: false },
    },
    yAxis: [
      { type: 'value', minInterval: 1, ...axisStyle(p) },
      {
        type: 'value',
        ...axisStyle(p),
        splitLine: { show: false },
        axisLabel: { color: p.ink3, formatter: (v: number) => formatPaise(v) },
      },
    ],
    series: [
      {
        name: 'Orders',
        type: 'bar',
        data: rows.map((r) => r.orders),
        barMaxWidth: 18,
        itemStyle: { borderRadius: [4, 4, 0, 0], color: p.series[0] },
      },
      {
        name: 'GMV',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: rows.map((r) => r.gmvPaise),
        tooltip: { valueFormatter: (v: number) => formatPaise(v) },
        lineStyle: { width: 2.5, color: p.series[1] },
        itemStyle: { color: p.series[1] },
      },
    ],
  });
}

/** Payment-method split of live orders, by amount. */
export function methodChart(t: DayStats): ChartOptions {
  const data = Object.entries(t.byMethod)
    .filter(([, b]) => b.paise > 0)
    .map(([k, b]) => ({ name: METHOD_LABELS[k] ?? k, value: b.paise, orders: b.orders }));
  return (p) => ({
    legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8 },
    tooltip: {
      trigger: 'item',
      formatter: (x: { name: string; value: number; percent: number }) =>
        `${x.name}<br/>${formatPaise(x.value)} · ${x.percent}%`,
    },
    series: [
      {
        type: 'pie',
        radius: ['52%', '76%'],
        center: ['50%', '44%'],
        itemStyle: { borderColor: p.surface, borderWidth: 3, borderRadius: 6 },
        label: { show: false },
        data,
      },
    ],
  });
}

/** Orders by hour of day (India time). */
export function hourChart(t: DayStats): ChartOptions {
  return (p) => ({
    grid: { ...grid, top: 12 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: HOURS.map((h) => `${h}:00`),
      ...axisStyle(p),
      splitLine: { show: false },
    },
    yAxis: { type: 'value', minInterval: 1, ...axisStyle(p) },
    series: [
      {
        name: 'Orders',
        type: 'bar',
        data: HOURS.map((h) => t.byHour[h] ?? 0),
        barMaxWidth: 14,
        itemStyle: { borderRadius: [3, 3, 0, 0], color: p.series[4] },
      },
    ],
  });
}

/** Horizontal bars, biggest on top (areas, top products). */
export function rankChart(
  items: { name: string; value: number }[],
  money: boolean,
  colorIndex = 0,
): ChartOptions {
  const sorted = [...items].sort((a, b) => a.value - b.value);
  const fmt = (v: number) => (money ? formatPaise(v) : String(v));
  return (p) => ({
    grid: { ...grid, top: 4, right: 16 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: fmt },
    xAxis: {
      type: 'value',
      ...axisStyle(p),
      axisLabel: { color: p.ink3, formatter: fmt },
    },
    yAxis: {
      type: 'category',
      data: sorted.map((i) => (i.name.length > 22 ? `${i.name.slice(0, 21)}…` : i.name)),
      ...axisStyle(p),
      axisLabel: { color: p.ink2 },
      splitLine: { show: false },
    },
    series: [
      {
        type: 'bar',
        data: sorted.map((i) => i.value),
        barMaxWidth: 16,
        itemStyle: { borderRadius: [0, 4, 4, 0], color: p.series[colorIndex] },
      },
    ],
  });
}
