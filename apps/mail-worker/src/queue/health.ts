import { loadEnv } from '@supermailer/config';
import { healthResponse } from '@supermailer/contracts';

export const getMailWorkerHealth = () => {
  const env = loadEnv();

  return {
    ...healthResponse('mail-worker'),
    port: env.mailWorkerPort,
    queueAdapter: 'bullmq-ready',
  };
};
