import type { ManagementConsoleDatabase } from '../db';

import { createApiKeysRepository } from './api-keys';
import { createAdminSessionsRepository } from './admin-sessions';
import { createAdminUsersRepository } from './admin-users';
import { createAuditLogsRepository } from './audit-logs';
import { createCallbackEndpointsRepository } from './callback-endpoints';
import { createDeliveryEventsRepository } from './delivery-events';
import { createOutboundWebhookDeliveriesRepository } from './outbound-webhook-deliveries';
import { createRoutingRulesRepository } from './routing-rules';
import { createSendDispatchAttemptsRepository } from './send-dispatch-attempts';
import { createSendSmtpNodesRepository } from './send-smtp-nodes';
import { createSendsRepository } from './sends';
import { createSuppressionsRepository } from './suppressions';

export const createRepositories = (db: ManagementConsoleDatabase) => ({
  adminUsers: createAdminUsersRepository(db),
  adminSessions: createAdminSessionsRepository(db),
  auditLogs: createAuditLogsRepository(db),
  callbackEndpoints: createCallbackEndpointsRepository(db),
  suppressions: createSuppressionsRepository(db),
  sends: createSendsRepository(db),
  deliveryEvents: createDeliveryEventsRepository(db),
  routingRules: createRoutingRulesRepository(db),
  sendDispatchAttempts: createSendDispatchAttemptsRepository(db),
  sendSmtpNodes: createSendSmtpNodesRepository(db),
  apiKeys: createApiKeysRepository(db),
  outboundWebhookDeliveries: createOutboundWebhookDeliveriesRepository(db),
});

export {
  createApiKeysRepository,
  createAdminSessionsRepository,
  createAdminUsersRepository,
  createAuditLogsRepository,
  createCallbackEndpointsRepository,
  createDeliveryEventsRepository,
  createOutboundWebhookDeliveriesRepository,
  createRoutingRulesRepository,
  createSendDispatchAttemptsRepository,
  createSendSmtpNodesRepository,
  createSendsRepository,
  createSuppressionsRepository,
};
