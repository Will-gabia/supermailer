export type ServiceHealth = 'healthy' | 'degraded';

export type HealthResponse = {
  service: 'management-console' | 'mail-worker';
  status: ServiceHealth;
};

export const healthResponse = (service: HealthResponse['service']): HealthResponse => ({
  service,
  status: 'healthy',
});
