import type { Context } from 'hono';

export const getRequestMetadata = (context: Context) => ({
  ipAddress: context.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  userAgent: context.req.header('user-agent') ?? null,
});
