import { randomUUID } from 'node:crypto';

import { Job, Queue, Worker, type ConnectionOptions } from 'bullmq';

import {
  DeliveryEventType,
  SEND_DISPATCH_MAX_ATTEMPTS,
  SEND_DISPATCH_RETRY_DELAYS_MS,
  SendState,
  SUPERMAILER_QUEUE_NAMES,
  type SendDispatchJob,
} from '@supermailer/contracts';

import { createSmtpDispatchTransport } from '../dispatch/smtp';
import type { DispatchTransport } from '../dispatch/types';
import {
  createWorkerPersistence,
  createWorkerDatabasePool,
  type WorkerPersistence,
} from '../persistence/database';

import { createRedisConnectionOptions } from './connection';

export class DispatchRetryableError extends Error {
  public readonly retryAfterMs: number;

  public constructor(message: string, retryAfterMs: number) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}

const toRetryDelayForAttempt = (
  attemptsMade: number,
  retryDelaysMs: readonly number[],
): number => {
  const index = Math.max(
    0,
    Math.min(attemptsMade - 1, retryDelaysMs.length - 1),
  );
  return retryDelaysMs[index];
};

const createDispatchWorkerOptions = (
  connection: ConnectionOptions,
  prefix: string | undefined,
  persistence: WorkerPersistence,
  transport: DispatchTransport,
  retryDelaysMs: readonly number[],
) => ({
  connection,
  prefix,
  concurrency: 1,
  removeOnComplete: {
    count: 200,
  },
  removeOnFail: {
    count: 500,
  },
  settings: {
    backoffStrategy: (attemptsMade: number) =>
      toRetryDelayForAttempt(attemptsMade, retryDelaysMs),
  },
  processor: async (job: Job<SendDispatchJob, void, string>) => {
    const send = await persistence.findSendById(job.data.sendId);

    if (!send) {
      return;
    }

    if (
      send.status === SendState.Delivered ||
      send.status === SendState.Bounced ||
      send.status === SendState.FailedPermanent ||
      send.status === SendState.FailedTransient
    ) {
      return;
    }

    await persistence.updateSendState(send.id, SendState.Dispatching);
    await persistence.appendDeliveryEvent({
      sendId: send.id,
      eventType: DeliveryEventType.Dispatching,
      rawPayload: {
        queueJobId: send.queueJobId,
      },
    });

    const route = await persistence.resolveRouteForSend(send);

    if (!route || route.nodes.length === 0) {
      await persistence.updateSendState(send.id, SendState.FailedPermanent);
      await persistence.appendDeliveryEvent({
        sendId: send.id,
        eventType: DeliveryEventType.FailedPermanent,
        reason: 'No active SendSMTP route available',
      });
      return;
    }

    let lastTransientFailure: {
      smtpCode: string | null;
      enhancedCode: string | null;
      reason: string;
      relayIdentity: string;
      rawPayload: Record<string, unknown>;
      attemptNumber: number;
    } | null = null;

    for (const candidate of route.nodes) {
      const relayIdentity = `${candidate.host}:${candidate.port}`;
      const attemptNumber = await persistence.getNextAttemptNumber(send.id);
      const attemptId = await persistence.createDispatchAttempt({
        sendId: send.id,
        attemptNumber,
        sendSmtpNodeId: candidate.nodeId,
        relayIdentity,
      });

      const outcome = await transport.dispatch({
        sendId: send.id,
        recipientEmail: send.recipientEmail,
        subject: send.subjectSnapshot,
        html: send.htmlSnapshot,
        text: send.textSnapshot,
        eml: send.emlSnapshot,
        smtpNode: {
          id: candidate.nodeId,
          host: candidate.host,
          port: candidate.port,
          username: candidate.username,
          passwordSecretRef: candidate.passwordSecretRef,
        },
      });

      if (outcome.result === 'accepted') {
        await persistence.finishDispatchAttempt({
          attemptId,
          status: 'accepted',
          smtpCode: outcome.smtpCode,
          enhancedCode: outcome.enhancedCode,
          reason: outcome.response,
          queueId: outcome.postfixQueueId,
          relayIdentity: outcome.relayIdentity ?? relayIdentity,
          rawPayload: outcome.rawPayload,
        });
        await persistence.markAcceptedByMta({
          sendId: send.id,
          attemptId,
          relayNodeId: candidate.nodeId,
          queueId: outcome.postfixQueueId,
          response: outcome.response,
        });
        await persistence.appendDeliveryEvent({
          sendId: send.id,
          eventType: DeliveryEventType.AcceptedByMta,
          smtpCode: outcome.smtpCode,
          enhancedSmtpCode: outcome.enhancedCode,
          reason: outcome.response,
          relayIdentity: outcome.relayIdentity ?? relayIdentity,
          queueId: outcome.postfixQueueId,
          rawPayload: outcome.rawPayload,
        });
        return;
      }

      if (outcome.result === 'failed_permanent') {
        await persistence.finishDispatchAttempt({
          attemptId,
          status: 'failed_permanent',
          smtpCode: outcome.smtpCode,
          enhancedCode: outcome.enhancedCode,
          reason: outcome.reason,
          queueId: null,
          relayIdentity,
          rawPayload: outcome.rawPayload,
        });
        await persistence.updateSendState(send.id, SendState.FailedPermanent);
        await persistence.appendDeliveryEvent({
          sendId: send.id,
          eventType: DeliveryEventType.FailedPermanent,
          smtpCode: outcome.smtpCode,
          enhancedSmtpCode: outcome.enhancedCode,
          reason: outcome.reason,
          relayIdentity,
          rawPayload: outcome.rawPayload,
        });
        return;
      }

      await persistence.finishDispatchAttempt({
        attemptId,
        status: 'failed_transient',
        smtpCode: outcome.smtpCode,
        enhancedCode: outcome.enhancedCode,
        reason: outcome.reason,
        queueId: null,
        relayIdentity,
        rawPayload: outcome.rawPayload,
      });

      lastTransientFailure = {
        smtpCode: outcome.smtpCode,
        enhancedCode: outcome.enhancedCode,
        reason: outcome.reason,
        relayIdentity,
        rawPayload: outcome.rawPayload,
        attemptNumber,
      };
    }

    const hasRetriesRemaining =
      (lastTransientFailure?.attemptNumber ?? 0) < SEND_DISPATCH_MAX_ATTEMPTS;

    if (hasRetriesRemaining && lastTransientFailure) {
      await persistence.updateSendState(send.id, SendState.Deferred);
      await persistence.appendDeliveryEvent({
        sendId: send.id,
        eventType: DeliveryEventType.Deferred,
        smtpCode: lastTransientFailure.smtpCode,
        enhancedSmtpCode: lastTransientFailure.enhancedCode,
        reason: lastTransientFailure.reason,
        relayIdentity: lastTransientFailure.relayIdentity,
        rawPayload: {
          ...lastTransientFailure.rawPayload,
          retryInMs: toRetryDelayForAttempt(
            lastTransientFailure.attemptNumber,
            retryDelaysMs,
          ),
          attemptNumber: lastTransientFailure.attemptNumber,
          failoverChainLength: route.nodes.length,
        },
      });

      throw new DispatchRetryableError(
        `Transient SMTP failure for send ${send.id}`,
        toRetryDelayForAttempt(
          lastTransientFailure.attemptNumber,
          retryDelaysMs,
        ),
      );
    }

    await persistence.updateSendState(send.id, SendState.FailedTransient);
    await persistence.appendDeliveryEvent({
      sendId: send.id,
      eventType: DeliveryEventType.FailedTransient,
      smtpCode: lastTransientFailure?.smtpCode ?? null,
      enhancedSmtpCode: lastTransientFailure?.enhancedCode ?? null,
      reason: lastTransientFailure?.reason ?? 'Transient SMTP failure',
      relayIdentity: lastTransientFailure?.relayIdentity ?? null,
      rawPayload: {
        ...(lastTransientFailure?.rawPayload ?? {}),
        exhaustedAttempts: SEND_DISPATCH_MAX_ATTEMPTS,
        failoverChainLength: route.nodes.length,
      },
    });
  },
});

export type SendDispatchWorkerOptions = {
  redisConnection?: ConnectionOptions;
  redisPrefix?: string;
  databaseUrl?: string;
  persistence?: WorkerPersistence;
  transport?: DispatchTransport;
  retryDelaysMs?: readonly number[];
};

export const createSendDispatchWorker = (
  options: SendDispatchWorkerOptions,
) => {
  if (
    !options.persistence &&
    !options.databaseUrl &&
    !process.env.DATABASE_URL
  ) {
    throw new Error(
      'createSendDispatchWorker requires databaseUrl when persistence is not provided',
    );
  }

  const connection = options.redisConnection ?? createRedisConnectionOptions();
  const pool = options.persistence
    ? null
    : createWorkerDatabasePool(
        options.databaseUrl ?? process.env.DATABASE_URL ?? '',
      );
  const persistence = options.persistence ?? createWorkerPersistence(pool!);
  const transport = options.transport ?? createSmtpDispatchTransport();
  const retryDelaysMs = options.retryDelaysMs ?? SEND_DISPATCH_RETRY_DELAYS_MS;
  const workerOptions = createDispatchWorkerOptions(
    connection,
    options.redisPrefix,
    persistence,
    transport,
    retryDelaysMs,
  );

  const worker = new Worker<SendDispatchJob, void, string>(
    SUPERMAILER_QUEUE_NAMES.sendDispatch,
    workerOptions.processor,
    {
      connection: workerOptions.connection,
      prefix: workerOptions.prefix,
      concurrency: workerOptions.concurrency,
      removeOnComplete: workerOptions.removeOnComplete,
      removeOnFail: workerOptions.removeOnFail,
      settings: workerOptions.settings,
    },
  );

  return {
    worker,
    close: async () => {
      await worker.close();
      if (pool) {
        await pool.end();
      }
    },
  };
};

export const createSendDispatchQueueForWorker = (
  options: { redisConnection?: ConnectionOptions; redisPrefix?: string } = {},
) =>
  new Queue<SendDispatchJob, void, string>(
    SUPERMAILER_QUEUE_NAMES.sendDispatch,
    {
      connection: options.redisConnection ?? createRedisConnectionOptions(),
      prefix: options.redisPrefix,
    },
  );

export const createWorkerPrefix = (): string =>
  `supermailer-worker-${randomUUID()}`;
