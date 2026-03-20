import type { ManagementConsoleDatabase } from '../db';

import { createApiKeysRepository } from './api-keys';
import { createAdminSessionsRepository } from './admin-sessions';
import { createAdminUsersRepository } from './admin-users';
import { createAuditLogsRepository } from './audit-logs';
import { createDeliveryEventsRepository } from './delivery-events';
import { createOutboundWebhookDeliveriesRepository } from './outbound-webhook-deliveries';
import { createRoutingRulesRepository } from './routing-rules';
import { createSendDispatchAttemptsRepository } from './send-dispatch-attempts';
import { createSendSmtpNodesRepository } from './send-smtp-nodes';
import { createSendsRepository } from './sends';
import { createSubscribersRepository } from './subscribers';
import { createSuppressionsRepository } from './suppressions';
import { createSyncRunsRepository } from './sync-runs';
import { createSyncRunRecordsRepository } from './sync-run-records';
import { createTemplatesRepository } from './templates';

export const createRepositories = (db: ManagementConsoleDatabase) => ({
  adminUsers: createAdminUsersRepository(db),
  adminSessions: createAdminSessionsRepository(db),
  auditLogs: createAuditLogsRepository(db),
  subscribers: createSubscribersRepository(db),
  suppressions: createSuppressionsRepository(db),
  templates: createTemplatesRepository(db),
  sends: createSendsRepository(db),
  deliveryEvents: createDeliveryEventsRepository(db),
  routingRules: createRoutingRulesRepository(db),
  sendDispatchAttempts: createSendDispatchAttemptsRepository(db),
  sendSmtpNodes: createSendSmtpNodesRepository(db),
  apiKeys: createApiKeysRepository(db),
  syncRuns: createSyncRunsRepository(db),
  syncRunRecords: createSyncRunRecordsRepository(db),
  outboundWebhookDeliveries: createOutboundWebhookDeliveriesRepository(db),
});

export {
  createApiKeysRepository,
  createAdminSessionsRepository,
  createAdminUsersRepository,
  createAuditLogsRepository,
  createDeliveryEventsRepository,
  createOutboundWebhookDeliveriesRepository,
  createRoutingRulesRepository,
  createSendDispatchAttemptsRepository,
  createSendSmtpNodesRepository,
  createSendsRepository,
  createSubscribersRepository,
  createSuppressionsRepository,
  createSyncRunsRepository,
  createSyncRunRecordsRepository,
  createTemplatesRepository,
};
