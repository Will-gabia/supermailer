export const SUPERMAILER_QUEUE_NAMES = {
  sendDispatch: 'send-dispatch',
} as const;

export type SupermailerQueueName =
  (typeof SUPERMAILER_QUEUE_NAMES)[keyof typeof SUPERMAILER_QUEUE_NAMES];

export type SendDispatchJob = {
  sendId: string;
};

export const SEND_DISPATCH_RETRY_DELAYS_MS = [
  60_000, 300_000, 900_000,
] as const;
export const SEND_DISPATCH_MAX_ATTEMPTS =
  SEND_DISPATCH_RETRY_DELAYS_MS.length + 1;
export const SEND_DISPATCH_RETRY_BACKOFF_TYPE = 'fixed-capped-exponential';

export const createSendDispatchJobId = (sendId: string): string =>
  `send-${sendId}`;
