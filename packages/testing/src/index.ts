import type { HealthResponse } from '@supermailer/contracts';

export const expectHealthy = (payload: HealthResponse): boolean => payload.status === 'healthy';

export { startPostgresContainer, startRedisContainer, waitFor } from './containers';
export { getLocalInfraPaths, readLocalPostfixConfig } from './local-infra';
