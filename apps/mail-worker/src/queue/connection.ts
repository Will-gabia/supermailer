import { loadEnv } from '@supermailer/config';

import type { ConnectionOptions } from 'bullmq';

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const createRedisConnectionOptions = (redisUrl = loadEnv().redisUrl): ConnectionOptions => {
  const parsed = new URL(redisUrl);

  return {
    host: parsed.hostname,
    port: toNumber(parsed.port, 6379),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: parsed.pathname.length > 1 ? toNumber(parsed.pathname.slice(1), 0) : undefined,
    maxRetriesPerRequest: null,
  };
};
