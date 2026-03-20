import { describe, expect, it } from 'vitest';

import { loadEnv } from './index';

describe('loadEnv', () => {
  it('merges defaults with overrides', () => {
    const env = loadEnv({ MANAGEMENT_CONSOLE_PORT: '3100' });

    expect(env.managementConsolePort).toBe(3100);
    expect(env.mailWorkerPort).toBe(3001);
  });
});
