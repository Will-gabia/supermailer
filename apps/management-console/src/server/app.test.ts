import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createManagementConsoleApp } from './app';

describe('management console app', () => {
  it('serves the health endpoint', async () => {
    const response = await createManagementConsoleApp().request('/api/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      service: 'management-console',
      status: 'healthy',
    });
  });

  it('serves built static assets for non-api routes', async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'sm-static-'));

    try {
      await mkdir(path.join(tempDirectory, 'assets'), { recursive: true });
      await writeFile(
        path.join(tempDirectory, 'assets', 'app.js'),
        'window.appLoaded = true;',
      );
      await writeFile(
        path.join(tempDirectory, 'index.html'),
        '<!doctype html><html><body>spa-index</body></html>',
      );

      const app = createManagementConsoleApp(undefined, {
        staticRoot: tempDirectory,
        spaIndexPath: path.join(tempDirectory, 'index.html'),
      });

      const response = await app.request('/assets/app.js');
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toContain('window.appLoaded = true');
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  it('falls back to index.html for non-api HTML routes', async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'sm-spa-'));

    try {
      await writeFile(
        path.join(tempDirectory, 'index.html'),
        '<!doctype html><html><body>spa-fallback</body></html>',
      );

      const app = createManagementConsoleApp(undefined, {
        staticRoot: tempDirectory,
        spaIndexPath: path.join(tempDirectory, 'index.html'),
      });

      const response = await app.request('/templates/new', {
        headers: {
          accept: 'text/html',
        },
      });

      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toContain('spa-fallback');
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  it('preserves /api/* behavior and returns api not_found for unknown api routes', async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'sm-api-'));

    try {
      await writeFile(
        path.join(tempDirectory, 'index.html'),
        '<!doctype html><html><body>spa</body></html>',
      );

      const app = createManagementConsoleApp(undefined, {
        staticRoot: tempDirectory,
        spaIndexPath: path.join(tempDirectory, 'index.html'),
      });

      const response = await app.request('/api/missing', {
        headers: {
          accept: 'text/html',
        },
      });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'not_found' });
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });
});
