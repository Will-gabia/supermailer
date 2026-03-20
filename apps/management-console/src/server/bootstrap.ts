import { createUlid } from '@supermailer/contracts';

import type { SupermailerEnv } from '@supermailer/config';

import type { ManagementConsoleAppContext } from './app-context';
import { hashPassword } from './security';

export const ensureSeededAdminUser = async ({ env, repositories }: Pick<ManagementConsoleAppContext, 'env' | 'repositories'>): Promise<void> => {
  const existing = await repositories.adminUsers.findByEmail(env.adminEmail);

  if (existing) {
    return;
  }

  await repositories.adminUsers.create({
    id: createUlid(),
    email: env.adminEmail,
    passwordHash: await hashPassword(env.adminPassword),
  });
};

export const getSessionExpiry = (env: SupermailerEnv, now = new Date()): Date => {
  const expiresAt = new Date(now);
  expiresAt.setHours(expiresAt.getHours() + env.sessionTtlHours);
  return expiresAt;
};
