import type { SupermailerEnv } from '@supermailer/config';

import type { ManagementConsoleDatabase } from './db';
import type { ManagementConsoleRepositories } from './app-types';
import type { SendDispatchEnqueuer } from './queue/send-dispatch';

export type ManagementConsoleAppContext = {
  env: SupermailerEnv;
  db: ManagementConsoleDatabase;
  repositories: ManagementConsoleRepositories;
  sendDispatchEnqueuer: SendDispatchEnqueuer;
};
