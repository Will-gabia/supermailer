import { describe, expect, it } from 'vitest';

import {
  buildRoutingViewSearch,
  defaultRoutingViewQueryState,
  parseRoutingViewFromSearch,
} from './routingViewQuery';

describe('routingViewQuery', () => {
  it('returns defaults when no query params are present', () => {
    expect(parseRoutingViewFromSearch('')).toEqual(
      defaultRoutingViewQueryState,
    );
  });

  it('falls back to nodes for invalid section values', () => {
    expect(parseRoutingViewFromSearch('?section=weird')).toEqual({
      section: 'nodes',
    });
  });

  it('serializes no query string for the default section', () => {
    expect(buildRoutingViewSearch({ section: 'nodes' })).toBe('');
  });

  it('round-trips a non-default routing section', () => {
    const state = { section: 'preview' as const };

    expect(parseRoutingViewFromSearch(buildRoutingViewSearch(state))).toEqual(
      state,
    );
  });
});
