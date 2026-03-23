import { describe, expect, it } from 'vitest';

import {
  buildTemplateViewSearch,
  defaultTemplateViewQueryState,
  parseTemplateViewFromSearch,
} from './templateViewQuery';

describe('templateViewQuery', () => {
  it('returns defaults when no query params are present', () => {
    expect(parseTemplateViewFromSearch('')).toEqual(
      defaultTemplateViewQueryState,
    );
  });

  it('treats blank template ids as null', () => {
    expect(parseTemplateViewFromSearch('?template=')).toEqual({
      templateId: null,
    });
  });

  it('serializes no query string for the default state', () => {
    expect(buildTemplateViewSearch({ templateId: null })).toBe('');
  });

  it('round-trips a selected template id', () => {
    const state = { templateId: 'tmpl_123' };

    expect(parseTemplateViewFromSearch(buildTemplateViewSearch(state))).toEqual(
      state,
    );
  });
});
