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
      scopes: ['subscriber-sync'],
    });
  });

  it('serializes no query string for the default scopes', () => {
    expect(buildApiKeyViewSearch({ scopes: ['subscriber-sync'] })).toBe('');
  });

  it('round-trips multiple scopes', () => {
    const state: ApiKeyViewQueryState = {
      scopes: ['campaign-send', 'individual-send'],
    };

    expect(parseApiKeyViewFromSearch(buildApiKeyViewSearch(state))).toEqual({
      scopes: ['campaign-send', 'individual-send'],
    });
  });
});
