import { describe, expect, it } from 'vitest';

import {
  buildSubscriberFiltersSearch,
  defaultSubscriberFilterQueryState,
  parseSubscriberFiltersFromSearch,
} from './subscriberFiltersQuery';

describe('subscriberFiltersQuery', () => {
  it('returns defaults when no query params are present', () => {
    expect(parseSubscriberFiltersFromSearch('')).toEqual(
      defaultSubscriberFilterQueryState,
    );
  });

  it('falls back to all for invalid tab values', () => {
    expect(parseSubscriberFiltersFromSearch('?tab=weird')).toEqual({
      tab: 'all',
    });
  });

  it('serializes no query string for the default tab', () => {
    expect(buildSubscriberFiltersSearch({ tab: 'all' })).toBe('');
  });

  it('round-trips a non-default tab', () => {
    const state = { tab: 'unsubscribed' as const };

    expect(
      parseSubscriberFiltersFromSearch(buildSubscriberFiltersSearch(state)),
    ).toEqual(state);
  });
});
