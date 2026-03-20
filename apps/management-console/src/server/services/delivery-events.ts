import {
  DeliveryEventType,
  OutboundResultCode,
  SendState,
  WebhookEventType,
  createDeliveryEventId,
  createDeliveryEventDto,
  parseDeliveryEventId,
  parseSendId,
  createUlid,
  normalizeEmailAddress,
  type DeliveryCodeHistogramEntryDto,
  type DeliveryEventIngestionResultDto,
  type DeliveryNodeBreakdownEntryDto,
  type DeliveryStatusCountDto,
  type OutboundSendResultWebhookDto,
  type SendEventHistoryEntryDto,
} from '@supermailer/contracts';
import {
  applyDeliveryEvent,
  getSendStateForDeliveryEventType,
} from '@supermailer/domain';

import type { ManagementConsoleAppContext } from '../app-context';

import { signOutboundResultWebhookPayload } from './delivery-event-signing';

type DeliveryEventEvidenceInput = {
  smtpCode?: string | null;
  enhancedCode?: string | null;
  reason?: string | null;
  relayNode?: string | null;
  queueId?: string | null;
  provenance?: string | null;
  payload?: Record<string, unknown> | null;
};

type InternalDeliveryEventInput = {
  eventId?: string | null;
  eventKey?: string | null;
  eventType?: string | null;
  sendId?: string | null;
  queueId?: string | null;
  attemptId?: string | null;
  occurredAt?: string | Date | null;
  smtpCode?: string | null;
  enhancedCode?: string | null;
  reason?: string | null;
  relayNode?: string | null;
  provenance?: string | null;
  payload?: Record<string, unknown> | null;
};

type SendSmtpDerivedDeliveryEventInput = {
  callbackId?: string | null;
  messageId?: string | null;
  sendId?: string | null;
  postfixQueueId?: string | null;
  queueId?: string | null;
  dispatchAttemptId?: string | null;
  attemptId?: string | null;
  finalStatus?: string | null;
  status?: string | null;
  smtpCode?: string | null;
  enhancedStatusCode?: string | null;
  enhancedCode?: string | null;
  relayNode?: string | null;
  relayIdentity?: string | null;
  diagnostic?: string | null;
  reason?: string | null;
  occurredAt?: string | Date | null;
  payload?: Record<string, unknown> | null;
};

type InboundDeliveryEventRequest =
  | {
      format: 'normalized';
      event: InternalDeliveryEventInput;
    }
  | {
      format: 'sendsmtp_log';
      event: SendSmtpDerivedDeliveryEventInput;
    };

type NormalizedInboundEvent = {
  sendId?: string | null;
  queueId?: string | null;
  attemptId?: string | null;
  eventKey: string;
  type: DeliveryEventType;
  occurredAt: Date;
  smtpCode: string | null;
  enhancedCode: string | null;
  reason: string | null;
  relayNode: string | null;
  provenance: string;
  rawPayload: Record<string, unknown>;
};

const DELIVERY_RESULT_TYPES = new Set<DeliveryEventType>([
  DeliveryEventType.Delivered,
  DeliveryEventType.Bounced,
  DeliveryEventType.FailedTransient,
  DeliveryEventType.FailedPermanent,
]);

const OUTBOUND_WEBHOOK_RETRY_DELAYS_MS = [60_000, 300_000, 900_000] as const;

const toObjectRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const toOptionalString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toOccurredAt = (value: string | Date | null | undefined): Date => {
  if (!value) {
    return new Date();
  }

  const occurredAt = value instanceof Date ? new Date(value) : new Date(value);

  if (Number.isNaN(occurredAt.valueOf())) {
    throw new Error('occurredAt must be a valid date');
  }

  return occurredAt;
};

const parseDeliveryEventType = (
  value: string | null | undefined,
): DeliveryEventType => {
  switch (value) {
    case DeliveryEventType.Queued:
    case DeliveryEventType.Dispatching:
    case DeliveryEventType.Deferred:
    case DeliveryEventType.AcceptedByMta:
    case DeliveryEventType.Delivered:
    case DeliveryEventType.Bounced:
    case DeliveryEventType.FailedTransient:
    case DeliveryEventType.FailedPermanent:
      return value;
    default:
      throw new Error('Unsupported delivery event type');
  }
};

const parseSendSmtpFinalStatus = (
  value: string | null | undefined,
): DeliveryEventType => {
  switch (value?.trim().toLowerCase()) {
    case 'accepted':
    case 'accepted_by_mta':
      return DeliveryEventType.AcceptedByMta;
    case 'deferred':
      return DeliveryEventType.Deferred;
    case 'delivered':
      return DeliveryEventType.Delivered;
    case 'bounced':
    case 'hard_bounce':
      return DeliveryEventType.Bounced;
    case 'failed_transient':
    case 'soft_bounce':
      return DeliveryEventType.FailedTransient;
    case 'failed_permanent':
    case 'rejected':
      return DeliveryEventType.FailedPermanent;
    default:
      throw new Error('Unsupported SendSMTP final status');
  }
};

const buildEvidence = (
  source: DeliveryEventEvidenceInput,
  fallbackProvenance: string,
): {
  smtpCode: string | null;
  enhancedCode: string | null;
  reason: string | null;
  relayNode: string | null;
  queueId: string | null;
  provenance: string;
  payload: Record<string, unknown>;
} => ({
  smtpCode: toOptionalString(source.smtpCode),
  enhancedCode: toOptionalString(source.enhancedCode),
  reason: toOptionalString(source.reason),
  relayNode: toOptionalString(source.relayNode),
  queueId: toOptionalString(source.queueId),
  provenance: toOptionalString(source.provenance) ?? fallbackProvenance,
  payload: toObjectRecord(source.payload),
});

const normalizeInboundRequest = (
  request: InboundDeliveryEventRequest,
): NormalizedInboundEvent => {
  if (request.format === 'normalized') {
    const event = request.event;
    const eventId =
      toOptionalString(event.eventKey) ??
      toOptionalString(event.eventId) ??
      (() => {
        throw new Error('eventKey or eventId is required');
      })();
    const evidence = buildEvidence(
      {
        smtpCode: event.smtpCode,
        enhancedCode: event.enhancedCode,
        reason: event.reason,
        relayNode: event.relayNode,
        queueId: event.queueId,
        provenance: event.provenance,
        payload: event.payload,
      },
      'normalized/internal',
    );

    return {
      sendId: toOptionalString(event.sendId),
      queueId: evidence.queueId,
      attemptId: toOptionalString(event.attemptId),
      eventKey: eventId,
      type: parseDeliveryEventType(toOptionalString(event.eventType)),
      occurredAt: toOccurredAt(event.occurredAt),
      smtpCode: evidence.smtpCode,
      enhancedCode: evidence.enhancedCode,
      reason: evidence.reason,
      relayNode: evidence.relayNode,
      provenance: evidence.provenance,
      rawPayload: evidence.payload,
    };
  }

  const event = request.event;
  const queueId =
    toOptionalString(event.postfixQueueId) ?? toOptionalString(event.queueId);
  const eventKey =
    toOptionalString(event.callbackId) ??
    toOptionalString(event.messageId) ??
    [
      toOptionalString(event.sendId),
      queueId,
      toOptionalString(event.finalStatus) ?? toOptionalString(event.status),
      toOccurredAt(event.occurredAt).toISOString(),
    ]
      .filter((value): value is string => Boolean(value))
      .join(':');

  if (!eventKey) {
    throw new Error('SendSMTP callback must provide a callback identifier');
  }

  const evidence = buildEvidence(
    {
      smtpCode: event.smtpCode,
      enhancedCode: event.enhancedStatusCode ?? event.enhancedCode,
      reason: event.diagnostic ?? event.reason,
      relayNode: event.relayNode ?? event.relayIdentity,
      queueId,
      provenance: 'sendsmtp/log-callback',
      payload: event.payload ?? toObjectRecord(event),
    },
    'sendsmtp/log-callback',
  );

  return {
    sendId: toOptionalString(event.sendId),
    queueId: evidence.queueId,
    attemptId:
      toOptionalString(event.dispatchAttemptId) ??
      toOptionalString(event.attemptId),
    eventKey,
    type: parseSendSmtpFinalStatus(
      toOptionalString(event.finalStatus) ?? toOptionalString(event.status),
    ),
    occurredAt: toOccurredAt(event.occurredAt),
    smtpCode: evidence.smtpCode,
    enhancedCode: evidence.enhancedCode,
    reason: evidence.reason,
    relayNode: evidence.relayNode,
    provenance: evidence.provenance,
    rawPayload: evidence.payload,
  };
};

const mapStateToOutboundResultCode = (
  state: SendState,
): OutboundResultCode | null => {
  switch (state) {
    case SendState.Delivered:
      return OutboundResultCode.Delivered;
    case SendState.Bounced:
      return OutboundResultCode.Bounced;
    case SendState.FailedTransient:
      return OutboundResultCode.FailedTransient;
    case SendState.FailedPermanent:
      return OutboundResultCode.FailedPermanent;
    default:
      return null;
  }
};

const createAggregateFromSend = async (
  appContext: ManagementConsoleAppContext,
  send: {
    id: string;
    status: string;
    createdAt: Date;
  },
) => {
  const history = await appContext.repositories.deliveryEvents.listForSend(
    send.id,
  );

  return {
    id: parseSendId(send.id),
    state: send.status as SendState,
    stateUpdatedAt: send.createdAt,
    processedProviderEventIds: new Set(history.map((event) => event.eventKey)),
    ignoredProviderEventIds: new Set<string>(),
    history: history.map((event) => ({
      id: parseDeliveryEventId(event.id),
      sendId: parseSendId(event.sendId),
      providerEventId: event.eventKey,
      type: event.eventType as DeliveryEventType,
      occurredAt: event.occurredAt,
    })),
  };
};

const deliverOutboundResultWebhook = async (
  appContext: ManagementConsoleAppContext,
  input: {
    send: {
      id: string;
      kind: string;
      recipientEmail: string;
      status: string;
    };
    deliveryEvent: {
      id: string;
      eventType: string;
      occurredAt: Date;
      eventKey: string;
      smtpCode: string | null;
      enhancedSmtpCode: string | null;
      reason: string | null;
      relayIdentity: string | null;
      queueId: string | null;
      provenance: string;
    };
  },
): Promise<void> => {
  if (input.send.kind !== 'individual') {
    return;
  }

  const resultCode = mapStateToOutboundResultCode(
    input.send.status as SendState,
  );

  if (!resultCode) {
    return;
  }

  const webhookDelivery =
    await appContext.repositories.outboundWebhookDeliveries.findBySendId(
      input.send.id,
    );

  if (!webhookDelivery) {
    return;
  }

  const event = createDeliveryEventDto({
    id: input.deliveryEvent.id,
    sendId: input.send.id,
    type: input.deliveryEvent.eventType as DeliveryEventType,
    occurredAt: input.deliveryEvent.occurredAt,
    providerEventId: input.deliveryEvent.eventKey,
    smtpReplyCode: input.deliveryEvent.smtpCode,
    smtpEnhancedCode: input.deliveryEvent.enhancedSmtpCode,
    reason: input.deliveryEvent.reason,
    relay: input.deliveryEvent.relayIdentity,
    postfixQueueId: input.deliveryEvent.queueId,
    provenance: input.deliveryEvent.provenance,
  });

  const payloadDto: OutboundSendResultWebhookDto = {
    eventType: WebhookEventType.SendStatusChanged,
    sendId: parseSendId(input.send.id),
    sendKind: 'individual',
    status: input.send.status as SendState,
    resultCode,
    recipientEmail: normalizeEmailAddress(input.send.recipientEmail),
    occurredAt: input.deliveryEvent.occurredAt,
    event,
  };

  const payload = JSON.stringify(payloadDto);
  const signature = signOutboundResultWebhookPayload(
    webhookDelivery.signingSecret,
    payload,
  );
  const now = new Date();

  try {
    const response = await fetch(webhookDelivery.targetUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-supermailer-signature': signature,
      },
      body: payload,
    });

    if (!response.ok) {
      throw new Error(`Webhook target responded ${response.status}`);
    }

    await appContext.repositories.outboundWebhookDeliveries.markAttempt(
      webhookDelivery.id,
      {
        status: 'delivered',
        attemptCount: webhookDelivery.attemptCount + 1,
        lastAttemptAt: now,
        nextAttemptAt: null,
        payload: payloadDto as unknown as Record<string, unknown>,
      },
    );
  } catch {
    const nextDelay =
      OUTBOUND_WEBHOOK_RETRY_DELAYS_MS[webhookDelivery.attemptCount] ?? null;

    await appContext.repositories.outboundWebhookDeliveries.markAttempt(
      webhookDelivery.id,
      {
        status: nextDelay === null ? 'failed' : 'retry_scheduled',
        attemptCount: webhookDelivery.attemptCount + 1,
        lastAttemptAt: now,
        nextAttemptAt:
          nextDelay === null ? null : new Date(now.getTime() + nextDelay),
        payload: payloadDto as unknown as Record<string, unknown>,
      },
    );
  }
};

export const ingestDeliveryEvent = async (
  appContext: ManagementConsoleAppContext,
  request: InboundDeliveryEventRequest,
): Promise<DeliveryEventIngestionResultDto> => {
  const normalizedEvent = normalizeInboundRequest(request);
  const existing = await appContext.repositories.deliveryEvents.findByEventKey(
    normalizedEvent.eventKey,
  );

  if (existing) {
    const send = await appContext.repositories.sends.findById(existing.sendId);

    if (!send) {
      throw new Error('Existing delivery event references missing send');
    }

    return {
      sendId: parseSendId(send.id),
      eventKey: existing.eventKey,
      eventId: parseDeliveryEventId(existing.id),
      outcome: 'ignored_duplicate',
      status: send.status as SendState,
    };
  }

  const send = await appContext.repositories.sends.findByCorrelation({
    sendId: normalizedEvent.sendId,
    queueId: normalizedEvent.queueId,
    attemptId: normalizedEvent.attemptId,
  });

  if (!send) {
    throw new Error('Matching send not found for delivery event');
  }

  const aggregate = await createAggregateFromSend(appContext, send);
  const result = applyDeliveryEvent(aggregate, {
    id: createDeliveryEventId(),
    sendId: parseSendId(send.id),
    providerEventId: normalizedEvent.eventKey,
    type: normalizedEvent.type,
    occurredAt: normalizedEvent.occurredAt,
  });

  if (result.outcome !== 'applied') {
    return {
      sendId: parseSendId(send.id),
      eventKey: normalizedEvent.eventKey,
      eventId: null,
      outcome: result.outcome,
      status: send.status as SendState,
    };
  }

  const eventId = createUlid();
  const persistedEvent = await appContext.repositories.deliveryEvents.append({
    id: eventId,
    sendId: send.id,
    eventKey: normalizedEvent.eventKey,
    eventType: normalizedEvent.type,
    smtpCode: normalizedEvent.smtpCode,
    enhancedSmtpCode: normalizedEvent.enhancedCode,
    reason: normalizedEvent.reason,
    relayIdentity: normalizedEvent.relayNode,
    queueId: normalizedEvent.queueId,
    provenance: normalizedEvent.provenance,
    rawPayload: normalizedEvent.rawPayload,
    occurredAt: normalizedEvent.occurredAt,
  });

  const nextStatus = getSendStateForDeliveryEventType(normalizedEvent.type);
  await appContext.repositories.sends.setStatus(send.id, nextStatus);

  if (DELIVERY_RESULT_TYPES.has(normalizedEvent.type)) {
    await deliverOutboundResultWebhook(appContext, {
      send: {
        id: send.id,
        kind: send.kind,
        recipientEmail: send.recipientEmail,
        status: nextStatus,
      },
      deliveryEvent: persistedEvent,
    });
  }

  return {
    sendId: parseSendId(send.id),
    eventKey: normalizedEvent.eventKey,
    eventId: parseDeliveryEventId(eventId),
    outcome: 'applied',
    status: nextStatus,
  };
};

export const getDeliveryReporting = async (
  appContext: ManagementConsoleAppContext,
): Promise<{
  statusCounts: DeliveryStatusCountDto[];
  codeHistogram: DeliveryCodeHistogramEntryDto[];
  nodeBreakdown: DeliveryNodeBreakdownEntryDto[];
}> => {
  const [statusCounts, codeHistogram, nodeBreakdown] = await Promise.all([
    appContext.repositories.deliveryEvents.countByStatus(),
    appContext.repositories.deliveryEvents.codeHistogram(),
    appContext.repositories.deliveryEvents.nodeBreakdown(),
  ]);

  return {
    statusCounts: statusCounts.map((entry) => ({
      status: entry.status as SendState,
      count: Number(entry.count),
    })),
    codeHistogram: codeHistogram.map((entry) => ({
      eventType: entry.eventType as DeliveryEventType,
      smtpReplyCode: entry.smtpCode,
      smtpEnhancedCode: entry.enhancedSmtpCode,
      count: Number(entry.count),
    })),
    nodeBreakdown: nodeBreakdown.map((entry) => ({
      node: entry.node ?? 'unknown',
      eventType: entry.eventType as DeliveryEventType,
      count: Number(entry.count),
    })),
  };
};

export const getSendEventHistory = async (
  appContext: ManagementConsoleAppContext,
  sendId: string,
): Promise<SendEventHistoryEntryDto[]> => {
  const events =
    await appContext.repositories.deliveryEvents.listForSend(sendId);

  return events.map((event) => ({
    ...createDeliveryEventDto({
      id: event.id,
      sendId: event.sendId,
      type: event.eventType as DeliveryEventType,
      occurredAt: event.occurredAt,
      providerEventId: event.eventKey,
      smtpReplyCode: event.smtpCode,
      smtpEnhancedCode: event.enhancedSmtpCode,
      reason: event.reason,
      relay: event.relayIdentity,
      postfixQueueId: event.queueId,
      provenance: event.provenance,
    }),
    receivedAt: event.receivedAt,
    payload: event.rawPayload,
  }));
};
