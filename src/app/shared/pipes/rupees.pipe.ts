import { Pipe, PipeTransform } from '@angular/core';

const whole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const exact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Money is int paise everywhere; this is the only place it becomes ₹. */
export function formatPaise(paise: number | null | undefined): string {
  if (paise == null || !Number.isFinite(paise)) return '—';
  return paise % 100 === 0 ? whole.format(paise / 100) : exact.format(paise / 100);
}

@Pipe({ name: 'rupees' })
export class RupeesPipe implements PipeTransform {
  transform(paise: number | null | undefined): string {
    return formatPaise(paise);
  }
}
