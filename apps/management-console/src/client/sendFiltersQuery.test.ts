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
      page: 1,
    });
  });

  it('falls back to all for invalid provenance values', () => {
    expect(parseSendFiltersFromSearch('?provenance=weird')).toEqual({
      recipientQuery: '',
      provenanceFilter: 'all',
      page: 1,
    });
  });

  it('parses positive page values and normalizes invalid ones', () => {
    expect(parseSendFiltersFromSearch('?page=3')).toEqual({
      recipientQuery: '',
      provenanceFilter: 'all',
      page: 3,
    });

    expect(parseSendFiltersFromSearch('?page=0')).toEqual({
      recipientQuery: '',
      provenanceFilter: 'all',
      page: 1,
    });
  });

  it('omits default values when serializing', () => {
    expect(buildSendFiltersSearch(defaultSendFilterQueryState)).toBe('');
  });

  it('round-trips a non-default filter state', () => {
    const state = {
      recipientQuery: 'VIP 고객',
      provenanceFilter: 'group' as const,
      page: 2,
    };

    expect(parseSendFiltersFromSearch(buildSendFiltersSearch(state))).toEqual(
      state,
    );
  });
});
