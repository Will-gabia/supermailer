import { createServer, type Server } from 'node:http';

import { loadEnv } from '@supermailer/config';

import { getMailWorkerHealth } from './queue/health';
import { createSendDispatchWorker } from './queue/send-dispatch-worker';

export const startMailWorker = () => getMailWorkerHealth();

export const formatMailWorkerHealth = () => JSON.stringify(startMailWorker());

const createHealthServer = () =>
  createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
      });
      response.end(formatMailWorkerHealth());
      return;
    }

    response.writeHead(404, {
      'content-type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify({ error: 'not_found' }));
  });

export const startMailWorkerHealthServer = async (
  port = getMailWorkerHealth().port,
): Promise<Server> => {
  const server = createHealthServer();

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  return server;
};

export const stopMailWorkerHealthServer = async (server: Server) => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
};

export const startMailWorkerRuntime = () => {
  const env = loadEnv();

  return createSendDispatchWorker({
    databaseUrl: env.databaseUrl,
  });
};

export {
  createSendDispatchQueue,
  createSubscriberSyncQueue,
  enqueueSendDispatchJob,
  enqueueSubscriberSyncJob,
} from './queue/primitives';

export {
  createWorkerPrefix,
  createSendDispatchQueueForWorker as createDispatchQueue,
  createSendDispatchWorker as createDispatchWorker,
  DispatchRetryableError,
} from './queue/send-dispatch-worker';

if (import.meta.url === `file://${process.argv[1]}`) {
  const health = startMailWorker();
  process.stdout.write(`${JSON.stringify(health)}\n`);

  const healthServerPromise = startMailWorkerHealthServer(health.port);
  const runtime = startMailWorkerRuntime();
  const shutdown = async () => {
    const healthServer = await healthServerPromise;
    await stopMailWorkerHealthServer(healthServer);
    await runtime.close();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });

  process.on('SIGTERM', () => {
    void shutdown();
  });
}
