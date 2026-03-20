import { describe, expect, it } from 'vitest';

import { loadEnv } from './index';

describe('loadEnv', () => {
  it('merges defaults with overrides', () => {
    const env = loadEnv({ MANAGEMENT_CONSOLE_PORT: '3100' });

    expect(env.managementConsolePort).toBe(3100);
    expect(env.mailWorkerPort).toBe(3001);
    expect(env.managementConsoleHost).toBe('0.0.0.0');
    expect(env.mailWorkerHost).toBe('0.0.0.0');
  });

  it('applies host binding overrides', () => {
    const env = loadEnv({
      MANAGEMENT_CONSOLE_HOST: '127.0.0.1',
      MAIL_WORKER_HOST: 'localhost',
    });

    expect(env.managementConsoleHost).toBe('127.0.0.1');
    expect(env.mailWorkerHost).toBe('localhost');
  });
});
