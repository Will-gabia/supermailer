import { Queue } from 'bullmq';

import { SUPERMAILER_QUEUE_NAMES, createSendDispatchJobId, type SendDispatchJob } from '@supermailer/contracts';
import { loadEnv } from '@supermailer/config';

type EnqueueResult = {
  jobId: string;
};

export type SendDispatchEnqueuer = {
  enqueueSend(sendId: string): Promise<EnqueueResult>;
};

const createRedisConnectionOptions = (redisUrl: string) => {
  const parsed = new URL(redisUrl);

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : undefined,
    maxRetriesPerRequest: null,
  };
};

export const createBullMqSendDispatchEnqueuer = (redisUrl = loadEnv().redisUrl): SendDispatchEnqueuer => {
  const queue = new Queue<SendDispatchJob, void, string>(SUPERMAILER_QUEUE_NAMES.sendDispatch, {
    connection: createRedisConnectionOptions(redisUrl),
  });

  return {
    enqueueSend: async (sendId: string) => {
      const jobId = createSendDispatchJobId(sendId);
      const existing = await queue.getJob(jobId);

      if (!existing) {
        await queue.add(SUPERMAILER_QUEUE_NAMES.sendDispatch, { sendId }, { jobId, removeOnComplete: false, removeOnFail: false });
      }

      return { jobId };
    },
  };
};

export const createInMemorySendDispatchEnqueuer = (): SendDispatchEnqueuer => {
  const seen = new Set<string>();

  return {
    enqueueSend: async (sendId: string) => {
      const jobId = createSendDispatchJobId(sendId);
      seen.add(jobId);
      return { jobId };
    },
  };
};
