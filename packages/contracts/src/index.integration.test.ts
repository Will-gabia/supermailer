import { describe, expect, it } from 'vitest';

import { healthResponse } from './index';

describe('contracts integration scaffold', () => {
  it('keeps service names aligned across apps', () => {
    expect(healthResponse('mail-worker').service).toBe('mail-worker');
  });
});
