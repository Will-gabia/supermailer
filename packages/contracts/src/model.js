import { createCampaignId, createDeliveryAttemptId, createDeliveryEventId, createRoutingRuleId, createSendId, createSubscriberId, createSuppressionEntryId, createTemplateId, createWebhookEndpointId, parseCampaignId, parseDeliveryAttemptId, parseDeliveryEventId, parseRoutingRuleId, parseSendId, parseSubscriberId, parseSuppressionEntryId, parseTemplateId, parseWebhookEndpointId, } from './identifiers';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const toOptionalDate = (value) => {
    if (!value) {
        return null;
    }
    const parsed = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(parsed.valueOf())) {
        throw new Error('Invalid ISO date value');
    }
    return parsed;
};
const toRequiredDate = (value) => {
    const parsed = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(parsed.valueOf())) {
        throw new Error('Invalid ISO date value');
    }
    return parsed;
};
export const normalizeEmailAddress = (email) => {
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalized)) {
        throw new Error('Email address must be valid');
    }
    return normalized;
};
export var SendState;
(function (SendState) {
    SendState["Draft"] = "draft";
    SendState["Queued"] = "queued";
    SendState["Dispatching"] = "dispatching";
    SendState["Deferred"] = "deferred";
    SendState["AcceptedByMta"] = "accepted_by_mta";
    SendState["Delivered"] = "delivered";
    SendState["Bounced"] = "bounced";
    SendState["FailedTransient"] = "failed_transient";
    SendState["FailedPermanent"] = "failed_permanent";
})(SendState || (SendState = {}));
export var DeliveryAttemptStatus;
(function (DeliveryAttemptStatus) {
    DeliveryAttemptStatus["Started"] = "started";
    DeliveryAttemptStatus["Accepted"] = "accepted";
    DeliveryAttemptStatus["Deferred"] = "deferred";
    DeliveryAttemptStatus["FailedTransient"] = "failed_transient";
    DeliveryAttemptStatus["FailedPermanent"] = "failed_permanent";
})(DeliveryAttemptStatus || (DeliveryAttemptStatus = {}));
export var DeliveryEventType;
(function (DeliveryEventType) {
    DeliveryEventType["Queued"] = "queued";
    DeliveryEventType["Dispatching"] = "dispatching";
    DeliveryEventType["Deferred"] = "deferred";
    DeliveryEventType["AcceptedByMta"] = "accepted_by_mta";
    DeliveryEventType["Delivered"] = "delivered";
    DeliveryEventType["Bounced"] = "bounced";
    DeliveryEventType["FailedTransient"] = "failed_transient";
    DeliveryEventType["FailedPermanent"] = "failed_permanent";
})(DeliveryEventType || (DeliveryEventType = {}));
export var RoutingRuleType;
(function (RoutingRuleType) {
    RoutingRuleType["ExactDomain"] = "exact_domain";
    RoutingRuleType["DefaultFallback"] = "default_fallback";
})(RoutingRuleType || (RoutingRuleType = {}));
export var SuppressionReason;
(function (SuppressionReason) {
    SuppressionReason["HardBounce"] = "hard_bounce";
    SuppressionReason["Unsubscribed"] = "unsubscribed";
})(SuppressionReason || (SuppressionReason = {}));
export var WebhookEventType;
(function (WebhookEventType) {
    WebhookEventType["SendStatusChanged"] = "send_status_changed";
})(WebhookEventType || (WebhookEventType = {}));
export var OutboundResultCode;
(function (OutboundResultCode) {
    OutboundResultCode["Delivered"] = "delivered";
    OutboundResultCode["Bounced"] = "bounced";
    OutboundResultCode["FailedTransient"] = "failed_transient";
    OutboundResultCode["FailedPermanent"] = "failed_permanent";
})(OutboundResultCode || (OutboundResultCode = {}));
export const createSubscriberDto = (input) => {
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
export const createTemplateDto = (input) => {
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
export const createCampaignDto = (input) => {
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
export const createIndividualSendDto = (input) => {
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
export const createRoutingRuleDto = (input) => {
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
export const createDeliveryAttemptDto = (input) => {
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
export const createDeliveryEventDto = (input) => {
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
export const createWebhookEndpointDto = (input) => {
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
export const createSuppressionEntryDto = (input) => ({
    id: input.id ? parseSuppressionEntryId(input.id) : createSuppressionEntryId(),
    email: normalizeEmailAddress(input.email),
    reason: input.reason,
    sourceEventId: input.sourceEventId
        ? parseDeliveryEventId(input.sourceEventId)
        : null,
    createdAt: input.createdAt ? toRequiredDate(input.createdAt) : new Date(),
});
