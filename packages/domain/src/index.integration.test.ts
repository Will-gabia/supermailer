import { describe, expect, it } from 'vitest';

import { describeWorkspace } from './index';

describe('domain integration scaffold', () => {
  it('lists both foundational services', () => {
    expect(describeWorkspace().services).toHaveLength(2);
  });
});
