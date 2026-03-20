import { healthResponse } from '@supermailer/contracts';

export const describeWorkspace = () => ({
  services: [healthResponse('management-console'), healthResponse('mail-worker')],
  runtime: 'pnpm-turbo-typescript',
});
