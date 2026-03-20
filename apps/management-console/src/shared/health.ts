import { loadEnv } from '@supermailer/config';
import { healthResponse } from '@supermailer/contracts';

export const getManagementConsoleHealth = () => {
  const env = loadEnv();

  return {
    ...healthResponse('management-console'),
    port: env.managementConsolePort,
  };
};
