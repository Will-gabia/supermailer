export const SUPERMAILER_QUEUE_NAMES = {
    sendDispatch: 'send-dispatch',
    subscriberSync: 'subscriber-sync',
};
export const SEND_DISPATCH_RETRY_DELAYS_MS = [
    60_000, 300_000, 900_000,
];
export const SEND_DISPATCH_MAX_ATTEMPTS = SEND_DISPATCH_RETRY_DELAYS_MS.length + 1;
export const SEND_DISPATCH_RETRY_BACKOFF_TYPE = 'fixed-capped-exponential';
export const createSendDispatchJobId = (sendId) => `send-${sendId}`;
export const createSubscriberSyncJobId = (syncRunId) => `sync-${syncRunId}`;
