import { describe, expect, it } from 'vitest';

import {
  buildSendFiltersSearch,
  defaultSendFilterQueryState,
  parseSendFiltersFromSearch,
} from './sendFiltersQuery';

describe('sendFiltersQuery', () => {
  it('returns defaults when no query params are present', () => {
    expect(parseSendFiltersFromSearch('')).toEqual(defaultSendFilterQueryState);
  });

  it('parses both search and provenance values', () => {
    expect(
      parseSendFiltersFromSearch(
        '?search=alice%40example.com&provenance=manual',
      ),
    ).toEqual({
      recipientQuery: 'alice@example.com',
      provenanceFilter: 'manual',
    });
  });

  it('falls back to all for invalid provenance values', () => {
    expect(parseSendFiltersFromSearch('?provenance=weird')).toEqual({
      recipientQuery: '',
      provenanceFilter: 'all',
    });
  });

  it('omits default values when serializing', () => {
    expect(buildSendFiltersSearch(defaultSendFilterQueryState)).toBe('');
  });

  it('round-trips a non-default filter state', () => {
    const state = {
      recipientQuery: 'VIP 고객',
      provenanceFilter: 'group' as const,
    };

    expect(parseSendFiltersFromSearch(buildSendFiltersSearch(state))).toEqual(
      state,
    );
  });
});
