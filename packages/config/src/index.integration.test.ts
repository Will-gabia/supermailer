import { describe, expect, it } from 'vitest';

import { loadEnv } from './index';

describe('config integration scaffold', () => {
  it('exposes deterministic local service defaults', () => {
    const env = loadEnv({});

    expect(env.databaseUrl).toContain('15432/supermailer');
    expect(env.redisUrl).toContain('16379');
    expect(env.mailpitSmtpPort).toBe(1025);
    expect(env.mailpitUiPort).toBe(8025);
    expect(env.sendSmtpPort).toBe(2525);
  });
});
