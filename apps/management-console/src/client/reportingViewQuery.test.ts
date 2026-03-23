import { describe, expect, it } from 'vitest';

import {
  buildReportingViewSearch,
  defaultReportingViewQueryState,
  parseReportingViewFromSearch,
} from './reportingViewQuery';

describe('reportingViewQuery', () => {
  it('returns defaults when no query params are present', () => {
    expect(parseReportingViewFromSearch('')).toEqual(
      defaultReportingViewQueryState,
    );
  });

  it('falls back to status for invalid section values', () => {
    expect(parseReportingViewFromSearch('?section=weird')).toEqual({
      section: 'status',
    });
  });

  it('serializes no query string for the default section', () => {
    expect(buildReportingViewSearch({ section: 'status' })).toBe('');
  });

  it('round-trips a non-default reporting section', () => {
    const state = { section: 'codes' as const };

    expect(
      parseReportingViewFromSearch(buildReportingViewSearch(state)),
    ).toEqual(state);
  });
});
