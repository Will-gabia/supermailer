import { Queue, type ConnectionOptions } from 'bullmq';

import {
  SEND_DISPATCH_MAX_ATTEMPTS,
  SEND_DISPATCH_RETRY_BACKOFF_TYPE,
  SUPERMAILER_QUEUE_NAMES,
  createSendDispatchJobId,
  type SendDispatchJob,
} from '@supermailer/contracts';

import { createRedisConnectionOptions } from './connection';

export type QueueFactoryOptions = {
  connection?: ConnectionOptions;
  prefix?: string;
};

export type EnqueuedQueueJob<TData extends object> = {
  id: string;
  name: string;
  data: TData;
};

const toEnqueuedQueueJob = <TData extends object>(job: {
  id?: string | undefined;
  name: string;
  data: TData;
}): EnqueuedQueueJob<TData> => ({
  id: job.id ?? '',
  name: job.name,
  data: job.data,
});

const createQueue = <TData extends object>(
  name: string,
  options: QueueFactoryOptions = {},
): Queue<TData, void, string> =>
  new Queue<TData, void, string>(name, {
    connection: options.connection ?? createRedisConnectionOptions(),
    prefix: options.prefix,
  });

const addIdempotentJob = async <TData extends object>(
  queue: Queue<TData, void, string>,
  name: string,
  data: TData,
  jobId: string,
  options?: {
    attempts?: number;
    backoff?: {
      type: string;
    };
  },
): Promise<EnqueuedQueueJob<TData>> => {
  const existing = await queue.getJob(jobId);

  if (existing) {
    return toEnqueuedQueueJob({
      id: existing.id,
      name: existing.name,
      data: existing.data as TData,
    });
  }

  try {
    const addJob = queue.add.bind(queue) as unknown as (
      name: string,
      data: TData,
      options: {
        jobId: string;
        removeOnComplete: boolean;
        removeOnFail: boolean;
        attempts?: number;
        backoff?: {
          type: string;
        };
      },
    ) => Promise<{
      id?: string;
      name: string;
      data: TData;
    }>;
    const created = await addJob(name, data, {
      jobId,
      removeOnComplete: false,
      removeOnFail: false,
      attempts: options?.attempts,
      backoff: options?.backoff,
    });

    return toEnqueuedQueueJob({
      id: created.id,
      name: created.name,
      data: created.data as TData,
    });
  } catch (error) {
    const duplicate = await queue.getJob(jobId);

    if (duplicate) {
      return toEnqueuedQueueJob({
        id: duplicate.id,
        name: duplicate.name,
        data: duplicate.data as TData,
      });
    }

    throw error;
  }
};

export const createSendDispatchQueue = (
  options: QueueFactoryOptions = {},
): Queue<SendDispatchJob, void, string> =>
  createQueue<SendDispatchJob>(SUPERMAILER_QUEUE_NAMES.sendDispatch, options);

export const enqueueSendDispatchJob = async (
  queue: Queue<SendDispatchJob, void, string>,
  payload: SendDispatchJob,
): Promise<EnqueuedQueueJob<SendDispatchJob>> =>
  addIdempotentJob(
    queue,
    SUPERMAILER_QUEUE_NAMES.sendDispatch,
    payload,
    createSendDispatchJobId(payload.sendId),
    {
      attempts: SEND_DISPATCH_MAX_ATTEMPTS,
      backoff: {
        type: SEND_DISPATCH_RETRY_BACKOFF_TYPE,
      },
    },
  );
