import { describe, expect, it } from 'vitest';

import { formatMailWorkerHealth, startMailWorker } from './index';

describe('mail worker scaffold', () => {
  it('exposes bullmq-ready runtime metadata', () => {
    expect(startMailWorker()).toMatchObject({
      service: 'mail-worker',
      queueAdapter: 'bullmq-ready',
    });
  });

  it('formats the health payload as JSON', () => {
    expect(JSON.parse(formatMailWorkerHealth())).toMatchObject({
      service: 'mail-worker',
      queueAdapter: 'bullmq-ready',
      port: 3001,
    });
  });
});
