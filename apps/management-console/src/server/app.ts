import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ManagementConsoleAppContext } from './app-context';
import type { AppVariables } from './app-types';
import { createHealthRouter } from './routes/health';
import { createAuthRouter } from './routes/auth';
import { createAdminRouter } from './routes/admin';
import { createDeliveryEventsRouter } from './routes/delivery-events';
import { createExternalApiRouter } from './routes/external-api';

export const createManagementConsoleApp = (
  appContext?: ManagementConsoleAppContext,
  options: {
    staticRoot?: string;
    spaIndexPath?: string;
  } = {},
) => {
  const app = new Hono<{ Variables: AppVariables }>();

  app.route('/api', createHealthRouter());

  if (appContext) {
    app.route('/api/auth', createAuthRouter(appContext));
    app.route('/api', createAdminRouter(appContext));
    app.route('/api', createDeliveryEventsRouter(appContext));
    app.route('/api', createExternalApiRouter(appContext));
  }

  if (options.staticRoot && options.spaIndexPath) {
    const spaIndexPath = options.spaIndexPath;
    const staticMiddleware = serveStatic({
      root: options.staticRoot,
    });

    app.use('*', async (context, next) => {
      if (context.req.path.startsWith('/api/')) {
        return next();
      }

      return staticMiddleware(context, next);
    });

    app.get('*', async (context) => {
      if (context.req.path.startsWith('/api/')) {
        return context.json({ error: 'not_found' }, 404);
      }

      const acceptsHtml =
        context.req.header('accept')?.includes('text/html') ?? false;

      if (context.req.method === 'GET' && acceptsHtml) {
        const html = await readFile(path.resolve(spaIndexPath), 'utf8');
        return context.html(html);
      }

      return context.json({ error: 'not_found' }, 404);
    });
  }

  return app;
};
