import {
  type CampaignId,
  type DeliveryAttemptId,
  type DeliveryEventId,
  type RoutingRuleId,
  type SendId,
  type SubscriberId,
  type SuppressionEntryId,
  type TemplateId,
  type WebhookEndpointId,
  createCampaignId,
  createDeliveryAttemptId,
  createDeliveryEventId,
  createRoutingRuleId,
  createSendId,
  createSubscriberId,
  createSuppressionEntryId,
  createTemplateId,
  createWebhookEndpointId,
  parseCampaignId,
  parseDeliveryAttemptId,
  parseDeliveryEventId,
  parseRoutingRuleId,
  parseSendId,
  parseSubscriberId,
  parseSuppressionEntryId,
  parseTemplateId,
  parseWebhookEndpointId,
} from './identifiers';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const toOptionalDate = (
  value: string | Date | null | undefined,
): Date | null => {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? new Date(value) : new Date(value);

  if (Number.isNaN(parsed.valueOf())) {
    throw new Error('Invalid ISO date value');
  }

  return parsed;
};

const toRequiredDate = (value: string | Date): Date => {
  const parsed = value instanceof Date ? new Date(value) : new Date(value);

  if (Number.isNaN(parsed.valueOf())) {
    throw new Error('Invalid ISO date value');
  }

  return parsed;
};

export const normalizeEmailAddress = (email: string): string => {
  const normalized = email.trim().toLowerCase();

  if (!EMAIL_PATTERN.test(normalized)) {
    throw new Error('Email address must be valid');
  }

  return normalized;
};

export enum SendState {
  Draft = 'draft',
  Queued = 'queued',
  Dispatching = 'dispatching',
  Deferred = 'deferred',
  AcceptedByMta = 'accepted_by_mta',
  Delivered = 'delivered',
  Bounced = 'bounced',
  FailedTransient = 'failed_transient',
  FailedPermanent = 'failed_permanent',
}

export enum DeliveryAttemptStatus {
  Started = 'started',
  Accepted = 'accepted',
  Deferred = 'deferred',
  FailedTransient = 'failed_transient',
  FailedPermanent = 'failed_permanent',
}

export enum DeliveryEventType {
  Queued = 'queued',
  Dispatching = 'dispatching',
  Deferred = 'deferred',
  AcceptedByMta = 'accepted_by_mta',
  Delivered = 'delivered',
  Bounced = 'bounced',
  FailedTransient = 'failed_transient',
  FailedPermanent = 'failed_permanent',
}

export enum RoutingRuleType {
  ExactDomain = 'exact_domain',
  DefaultFallback = 'default_fallback',
}

export enum SuppressionReason {
  HardBounce = 'hard_bounce',
  Unsubscribed = 'unsubscribed',
}

export enum WebhookEventType {
  SendStatusChanged = 'send_status_changed',
}

export enum OutboundResultCode {
  Delivered = 'delivered',
  Bounced = 'bounced',
  FailedTransient = 'failed_transient',
  FailedPermanent = 'failed_permanent',
}

export type SubscriberDto = {
  id: SubscriberId;
  email: string;
  externalId: string | null;
  isUnsubscribed: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type TemplateDto = {
  id: TemplateId;
  name: string;
  subject: string;
  html: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CampaignDto = {
  id: CampaignId;
  name: string;
  templateId: TemplateId;
  createdAt: Date;
};

export type IndividualSendDto = {
  id: SendId;
  campaignId: CampaignId | null;
  subscriberId: SubscriberId | null;
  to: string;
  state: SendState;
  templateSnapshotSubject: string;
  templateSnapshotHtml: string;
  correlationHeader: string;
  createdAt: Date;
  updatedAt: Date;
};

export type RoutingRuleDto = {
  id: RoutingRuleId;
  type: RoutingRuleType;
  recipientDomain: string | null;
  smtpNodeKey: string;
  priority: number;
  isActive: boolean;
  version: number;
  createdAt: Date;
};

export type DeliveryAttemptDto = {
  id: DeliveryAttemptId;
  sendId: SendId;
  smtpNodeKey: string;
  status: DeliveryAttemptStatus;
  smtpReplyCode: string | null;
  smtpEnhancedCode: string | null;
  reason: string | null;
  startedAt: Date;
  finishedAt: Date | null;
};

export type DeliveryEventDto = {
  id: DeliveryEventId;
  sendId: SendId;
  type: DeliveryEventType;
  occurredAt: Date;
  providerEventId: string;
  smtpReplyCode: string | null;
  smtpEnhancedCode: string | null;
  reason: string | null;
  relay: string | null;
  postfixQueueId: string | null;
  provenance: string;
};

export type WebhookEndpointDto = {
  id: WebhookEndpointId;
  sendId: SendId;
  url: string;
  signingSecret: string;
  eventType: WebhookEventType;
  createdAt: Date;
};

export type DeliveryEventEvidence = {
  smtpReplyCode: string | null;
  smtpEnhancedCode: string | null;
  reason: string | null;
  relay: string | null;
  postfixQueueId: string | null;
  provenance: string;
  payload: Record<string, unknown> | null;
};

export type DeliveryEventIngestionOutcome =
  | 'applied'
  | 'ignored_duplicate'
  | 'ignored_stale';

export type DeliveryEventIngestionDto = {
  sendId: SendId;
  eventKey: string;
  type: DeliveryEventType;
  occurredAt: Date;
  evidence: DeliveryEventEvidence;
};

export type DeliveryEventIngestionResultDto = {
  sendId: SendId;
  eventKey: string;
  eventId: DeliveryEventId | null;
  outcome: DeliveryEventIngestionOutcome;
  status: SendState;
};

export type OutboundSendResultWebhookDto = {
  eventType: WebhookEventType.SendStatusChanged;
  sendId: SendId;
  sendKind: 'individual';
  status: SendState;
  resultCode: OutboundResultCode;
  recipientEmail: string;
  occurredAt: Date;
  event: DeliveryEventDto;
};

export type DeliveryStatusCountDto = {
  status: SendState;
  count: number;
};

export type DeliveryCodeHistogramEntryDto = {
  eventType: DeliveryEventType;
  smtpReplyCode: string | null;
  smtpEnhancedCode: string | null;
  count: number;
};

export type DeliveryNodeBreakdownEntryDto = {
  node: string;
  eventType: DeliveryEventType;
  count: number;
};

export type SendEventHistoryEntryDto = DeliveryEventDto & {
  receivedAt: Date;
  payload: Record<string, unknown> | null;
};

export type SuppressionEntryDto = {
  id: SuppressionEntryId;
  email: string;
  reason: SuppressionReason;
  sourceEventId: DeliveryEventId | null;
  createdAt: Date;
};

export const createSubscriberDto = (input: {
  id?: string;
  email: string;
  externalId?: string | null;
  isUnsubscribed?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}): SubscriberDto => {
  const createdAt = input.createdAt
    ? toRequiredDate(input.createdAt)
    : new Date();
  const updatedAt = input.updatedAt
    ? toRequiredDate(input.updatedAt)
    : new Date(createdAt);

  return {
    id: input.id ? parseSubscriberId(input.id) : createSubscriberId(),
    email: normalizeEmailAddress(input.email),
    externalId: input.externalId ?? null,
    isUnsubscribed: input.isUnsubscribed ?? false,
    createdAt,
    updatedAt,
  };
};

export const createTemplateDto = (input: {
  id?: string;
  name: string;
  subject: string;
  html: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}): TemplateDto => {
  if (!input.name.trim()) {
    throw new Error('Template name is required');
  }

  if (!input.subject.trim()) {
    throw new Error('Template subject is required');
  }

  if (!input.html.trim()) {
    throw new Error('Template html is required');
  }

  const createdAt = input.createdAt
    ? toRequiredDate(input.createdAt)
    : new Date();
  const updatedAt = input.updatedAt
    ? toRequiredDate(input.updatedAt)
    : new Date(createdAt);

  return {
    id: input.id ? parseTemplateId(input.id) : createTemplateId(),
    name: input.name,
    subject: input.subject,
    html: input.html,
    createdAt,
    updatedAt,
  };
};

export const createCampaignDto = (input: {
  id?: string;
  name: string;
  templateId: string;
  createdAt?: string | Date;
}): CampaignDto => {
  if (!input.name.trim()) {
    throw new Error('Campaign name is required');
  }

  return {
    id: input.id ? parseCampaignId(input.id) : createCampaignId(),
    name: input.name,
    templateId: parseTemplateId(input.templateId),
    createdAt: input.createdAt ? toRequiredDate(input.createdAt) : new Date(),
  };
};

export const createIndividualSendDto = (input: {
  id?: string;
  campaignId?: string | null;
  subscriberId?: string | null;
  to: string;
  state: SendState;
  templateSnapshotSubject: string;
  templateSnapshotHtml: string;
  correlationHeader: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}): IndividualSendDto => {
  if (!input.templateSnapshotSubject.trim()) {
    throw new Error('Template snapshot subject is required');
  }

  if (!input.templateSnapshotHtml.trim()) {
    throw new Error('Template snapshot html is required');
  }

  if (!input.correlationHeader.trim()) {
    throw new Error('Correlation header is required');
  }

  const createdAt = input.createdAt
    ? toRequiredDate(input.createdAt)
    : new Date();
  const updatedAt = input.updatedAt
    ? toRequiredDate(input.updatedAt)
    : new Date(createdAt);

  return {
    id: input.id ? parseSendId(input.id) : createSendId(),
    campaignId: input.campaignId ? parseCampaignId(input.campaignId) : null,
    subscriberId: input.subscriberId
      ? parseSubscriberId(input.subscriberId)
      : null,
    to: normalizeEmailAddress(input.to),
    state: input.state,
    templateSnapshotSubject: input.templateSnapshotSubject,
    templateSnapshotHtml: input.templateSnapshotHtml,
    correlationHeader: input.correlationHeader,
    createdAt,
    updatedAt,
  };
};

export const createRoutingRuleDto = (input: {
  id?: string;
  type: RoutingRuleType;
  recipientDomain?: string | null;
  smtpNodeKey: string;
  priority: number;
  isActive?: boolean;
  version: number;
  createdAt?: string | Date;
}): RoutingRuleDto => {
  if (!input.smtpNodeKey.trim()) {
    throw new Error('smtpNodeKey is required');
  }

  if (!Number.isInteger(input.priority)) {
    throw new Error('priority must be an integer');
  }

  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new Error('version must be a positive integer');
  }

  const recipientDomain = input.recipientDomain
    ? input.recipientDomain.trim().toLowerCase()
    : null;

  if (input.type === RoutingRuleType.ExactDomain && !recipientDomain) {
    throw new Error('Exact domain routing requires recipientDomain');
  }

  if (input.type === RoutingRuleType.DefaultFallback && recipientDomain) {
    throw new Error('Default fallback routing cannot include recipientDomain');
  }

  return {
    id: input.id ? parseRoutingRuleId(input.id) : createRoutingRuleId(),
    type: input.type,
    recipientDomain,
    smtpNodeKey: input.smtpNodeKey,
    priority: input.priority,
    isActive: input.isActive ?? true,
    version: input.version,
    createdAt: input.createdAt ? toRequiredDate(input.createdAt) : new Date(),
  };
};

export const createDeliveryAttemptDto = (input: {
  id?: string;
  sendId: string;
  smtpNodeKey: string;
  status: DeliveryAttemptStatus;
  smtpReplyCode?: string | null;
  smtpEnhancedCode?: string | null;
  reason?: string | null;
  startedAt?: string | Date;
  finishedAt?: string | Date | null;
}): DeliveryAttemptDto => {
  if (!input.smtpNodeKey.trim()) {
    throw new Error('smtpNodeKey is required');
  }

  return {
    id: input.id ? parseDeliveryAttemptId(input.id) : createDeliveryAttemptId(),
    sendId: parseSendId(input.sendId),
    smtpNodeKey: input.smtpNodeKey,
    status: input.status,
    smtpReplyCode: input.smtpReplyCode ?? null,
    smtpEnhancedCode: input.smtpEnhancedCode ?? null,
    reason: input.reason ?? null,
    startedAt: input.startedAt ? toRequiredDate(input.startedAt) : new Date(),
    finishedAt: toOptionalDate(input.finishedAt),
  };
};

export const createDeliveryEventDto = (input: {
  id?: string;
  sendId: string;
  type: DeliveryEventType;
  occurredAt?: string | Date;
  providerEventId: string;
  smtpReplyCode?: string | null;
  smtpEnhancedCode?: string | null;
  reason?: string | null;
  relay?: string | null;
  postfixQueueId?: string | null;
  provenance: string;
}): DeliveryEventDto => {
  if (!input.providerEventId.trim()) {
    throw new Error('providerEventId is required');
  }

  if (!input.provenance.trim()) {
    throw new Error('provenance is required');
  }

  return {
    id: input.id ? parseDeliveryEventId(input.id) : createDeliveryEventId(),
    sendId: parseSendId(input.sendId),
    type: input.type,
    occurredAt: input.occurredAt
      ? toRequiredDate(input.occurredAt)
      : new Date(),
    providerEventId: input.providerEventId,
    smtpReplyCode: input.smtpReplyCode ?? null,
    smtpEnhancedCode: input.smtpEnhancedCode ?? null,
    reason: input.reason ?? null,
    relay: input.relay ?? null,
    postfixQueueId: input.postfixQueueId ?? null,
    provenance: input.provenance,
  };
};

export const createWebhookEndpointDto = (input: {
  id?: string;
  sendId: string;
  url: string;
  signingSecret: string;
  eventType: WebhookEventType;
  createdAt?: string | Date;
}): WebhookEndpointDto => {
  if (!input.url.trim()) {
    throw new Error('Webhook url is required');
  }

  if (!input.signingSecret.trim()) {
    throw new Error('Webhook signingSecret is required');
  }

  return {
    id: input.id ? parseWebhookEndpointId(input.id) : createWebhookEndpointId(),
    sendId: parseSendId(input.sendId),
    url: input.url,
    signingSecret: input.signingSecret,
    eventType: input.eventType,
    createdAt: input.createdAt ? toRequiredDate(input.createdAt) : new Date(),
  };
};

export const createSuppressionEntryDto = (input: {
  id?: string;
  email: string;
  reason: SuppressionReason;
  sourceEventId?: string | null;
  createdAt?: string | Date;
}): SuppressionEntryDto => ({
  id: input.id ? parseSuppressionEntryId(input.id) : createSuppressionEntryId(),
  email: normalizeEmailAddress(input.email),
  reason: input.reason,
  sourceEventId: input.sourceEventId
    ? parseDeliveryEventId(input.sourceEventId)
    : null,
  createdAt: input.createdAt ? toRequiredDate(input.createdAt) : new Date(),
});
