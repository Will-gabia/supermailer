import type { createRepositories } from './repositories';

export type ManagementConsoleRepositories = ReturnType<typeof createRepositories>;

export type AuthenticatedAdmin = {
  id: string;
  email: string;
  sessionId: string;
};

export type AuthenticatedApiKey = {
  id: string;
  keyPrefix: string;
  scopes: string[];
};

export type AppVariables = {
  adminUser: AuthenticatedAdmin;
  apiKey: AuthenticatedApiKey;
};
