import { describe, expect, it } from 'vitest';

import {
  type ApiKeyViewQueryState,
  buildApiKeyViewSearch,
  defaultApiKeyViewQueryState,
  parseApiKeyViewFromSearch,
} from './apiKeyViewQuery';

describe('apiKeyViewQuery', () => {
  it('returns defaults when no query params are present', () => {
    expect(parseApiKeyViewFromSearch('')).toEqual(defaultApiKeyViewQueryState);
  });

  it('filters invalid scopes and falls back to defaults', () => {
    expect(parseApiKeyViewFromSearch('?scope=weird')).toEqual({
      scopes: ['individual-send'],
    });
  });

  it('serializes no query string for the default scopes', () => {
    expect(buildApiKeyViewSearch({ scopes: ['individual-send'] })).toBe('');
  });

  it('round-trips single allowed scope', () => {
    const state: ApiKeyViewQueryState = {
      scopes: ['individual-send'],
    };

    expect(parseApiKeyViewFromSearch(buildApiKeyViewSearch(state))).toEqual({
      scopes: ['individual-send'],
    });
  });
});
