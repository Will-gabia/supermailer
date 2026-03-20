import { config as loadDotEnv } from 'dotenv';

export type SupermailerEnv = {
  nodeEnv: string;
  managementConsolePort: number;
  mailWorkerPort: number;
  databaseUrl: string;
  redisUrl: string;
  adminEmail: string;
  adminPassword: string;
  authTokenSecret: string;
  sessionCookieName: string;
  sessionTtlHours: number;
  mailpitSmtpHost: string;
  mailpitSmtpPort: number;
  mailpitUiPort: number;
  sendSmtpHost: string;
  sendSmtpPort: number;
};

export const loadEnv = (overrides: Partial<NodeJS.ProcessEnv> = {}): SupermailerEnv => {
  loadDotEnv();

  const merged = {
    ...process.env,
    ...overrides,
  };

  return {
    nodeEnv: merged.NODE_ENV ?? 'development',
    managementConsolePort: Number(merged.MANAGEMENT_CONSOLE_PORT ?? 3000),
    mailWorkerPort: Number(merged.MAIL_WORKER_PORT ?? 3001),
    databaseUrl: merged.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:15432/supermailer',
    redisUrl: merged.REDIS_URL ?? 'redis://localhost:16379',
    adminEmail: merged.ADMIN_EMAIL ?? 'admin@supermailer.local',
    adminPassword: merged.ADMIN_PASSWORD ?? 'supermailer-admin',
    authTokenSecret: merged.AUTH_TOKEN_SECRET ?? 'supermailer-local-auth-secret',
    sessionCookieName: merged.SESSION_COOKIE_NAME ?? 'supermailer_admin_session',
    sessionTtlHours: Number(merged.SESSION_TTL_HOURS ?? 24),
    mailpitSmtpHost: merged.MAILPIT_SMTP_HOST ?? 'localhost',
    mailpitSmtpPort: Number(merged.MAILPIT_SMTP_PORT ?? 1025),
    mailpitUiPort: Number(merged.MAILPIT_UI_PORT ?? 8025),
    sendSmtpHost: merged.SENDSMTP_HOST ?? 'localhost',
    sendSmtpPort: Number(merged.SENDSMTP_PORT ?? 2525),
  };
};
