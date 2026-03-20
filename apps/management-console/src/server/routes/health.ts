import { Hono } from 'hono';

import { getManagementConsoleHealth } from '../../shared/health';

export const createHealthRouter = () => {
  const app = new Hono();

  app.get('/health', (context) => context.json(getManagementConsoleHealth()));

  return app;
};
