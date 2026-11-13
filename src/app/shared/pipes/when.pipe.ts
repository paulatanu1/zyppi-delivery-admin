import { Pipe, PipeTransform } from '@angular/core';
import { Timestamp } from 'firebase/firestore';

const fmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** Firestore Timestamp / Date / millis → "13 Nov 2026, 10:42 pm" (IST locale). */
export function formatWhen(value: Timestamp | Date | number | null | undefined): string {
  if (value == null) return '—';
  const date =
    value instanceof Timestamp ? value.toDate() : value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : fmt.format(date);
}

@Pipe({ name: 'when' })
export class WhenPipe implements PipeTransform {
  transform(value: Timestamp | Date | number | null | undefined): string {
    return formatWhen(value);
  }
}
