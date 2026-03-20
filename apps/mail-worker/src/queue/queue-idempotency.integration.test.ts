import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { createSendDispatchJobId } from '@supermailer/contracts';
import { startRedisContainer, waitFor } from '@supermailer/testing';

import { createRedisConnectionOptions } from './connection';
import { createSendDispatchQueue, enqueueSendDispatchJob } from './primitives';

describe('queue-idempotency integration', () => {
  let redisUrl = '';
  let stopContainer: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const redis = await startRedisContainer();
    redisUrl = redis.redisUrl;
    stopContainer = async () => {
      await redis.container.stop();
    };

    await waitFor(async () => {
      const queue = createSendDispatchQueue({
        connection: createRedisConnectionOptions(redisUrl),
        prefix: `supermailer-ping-${randomUUID()}`,
      });

      await queue.waitUntilReady();
      await queue.close();
    });
  });

  afterAll(async () => {
    await stopContainer?.();
  });

  it('reuses deterministic BullMQ job ids for repeated send enqueue requests', async () => {
    const queue = createSendDispatchQueue({
      connection: createRedisConnectionOptions(redisUrl),
      prefix: `supermailer-test-${randomUUID()}`,
    });

    try {
      const firstJob = await enqueueSendDispatchJob(queue, { sendId: '01HZYF8SEND00000000000002' });
      const secondJob = await enqueueSendDispatchJob(queue, { sendId: '01HZYF8SEND00000000000002' });

      expect(firstJob.id).toBe(createSendDispatchJobId('01HZYF8SEND00000000000002'));
      expect(secondJob.id).toBe(firstJob.id);
      expect(secondJob.data).toEqual(firstJob.data);
      await expect(queue.getJobs(['waiting', 'prioritized', 'delayed', 'active'])).resolves.toHaveLength(1);
    } finally {
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
});
