import { Hono } from 'hono';
import type { ManagementConsoleAppContext } from './app-context';
import type { AppVariables } from './app-types';
import { createHealthRouter } from './routes/health';
import { createAuthRouter } from './routes/auth';
import { createAdminRouter } from './routes/admin';
import { createDeliveryEventsRouter } from './routes/delivery-events';
import { createExternalApiRouter } from './routes/external-api';

export const createManagementConsoleApp = (
  appContext?: ManagementConsoleAppContext,
) => {
  const app = new Hono<{ Variables: AppVariables }>();

  app.route('/api', createHealthRouter());

  if (!appContext) {
    return app;
  }

  app.route('/api/auth', createAuthRouter(appContext));
  app.route('/api', createAdminRouter(appContext));
  app.route('/api', createDeliveryEventsRouter(appContext));
  app.route('/api', createExternalApiRouter(appContext));

  return app;
};
