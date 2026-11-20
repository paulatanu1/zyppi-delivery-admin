import { Injectable, inject } from '@angular/core';
import { Callables } from '../../core/firebase/callable';
import { Period, SearchInsights } from './search-insights.models';

/** Read-only: totals are written by the logSearch callable (customer app). */
@Injectable({ providedIn: 'root' })
export class SearchInsightsApi {
  private readonly callables = inject(Callables);

  load(days: Period): Promise<SearchInsights> {
    return this.callables.call('adminSearchInsights', { days });
  }
}
