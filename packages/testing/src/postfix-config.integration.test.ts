import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { getLocalInfraPaths, readLocalPostfixConfig } from './local-infra';

describe('postfix-config integration', () => {
  it('pins local infra assets for deterministic agent execution', async () => {
    const paths = getLocalInfraPaths();
    const [composeFile, mainCf, entrypoint] = await Promise.all([
      readFile(paths.dockerComposeFile, 'utf8'),
      readLocalPostfixConfig(),
      readFile(paths.postfixEntrypoint, 'utf8'),
    ]);

    expect(composeFile).toContain('postgres:');
    expect(composeFile).toContain('redis:');
    expect(composeFile).toContain('mailpit:');
    expect(composeFile).toContain('postfix-local:');
    expect(composeFile).toContain('${POSTGRES_PORT:-15432}:5432');
    expect(composeFile).toContain('${REDIS_PORT:-16379}:6379');
    expect(composeFile).toContain('2525:25');
    expect(composeFile).toContain('./infra/postfix/logs:/var/log/postfix');

    expect(mainCf).toContain('enable_long_queue_ids = yes');
    expect(mainCf).toContain('relayhost = [mailpit]:1025');
    expect(mainCf).toContain('maillog_file = /var/log/postfix/postfix.log');

    expect(entrypoint).toContain('postconf -n');
    expect(entrypoint).toContain('/var/log/postfix/postconf.current');
  });

  it('keeps the postfix helper script executable for local debugging', async () => {
    const { postfixEntrypoint } = getLocalInfraPaths();
    await expect(access(postfixEntrypoint, constants.X_OK)).resolves.toBeUndefined();
  });
});
