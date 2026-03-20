import { describe, expect, it } from 'vitest';

import {
  SEND_CORRELATION_HEADER,
  DeliveryEventType,
  RoutingRuleType,
  SendState,
  SuppressionReason,
  WebhookEventType,
  createDeliveryEventDto,
  createIndividualSendDto,
  createRoutingRuleDto,
  createSubscriberDto,
  createSuppressionEntryDto,
  createUlid,
  isUlid,
  normalizeEmailAddress,
  parseSendId,
} from './index';

describe('ids-and-dtos', () => {
  it('generates valid ULIDs and exposes correlation header', () => {
    const id = createUlid();

    expect(isUlid(id)).toBe(true);
    expect(SEND_CORRELATION_HEADER).toBe('X-Supermailer-Send-Id');
  });

  it('normalizes email and validates send DTO invariants', () => {
    const sendId = createUlid();
    const send = createIndividualSendDto({
      id: sendId,
      to: ' Alice@Example.com ',
      state: SendState.Queued,
      templateSnapshotSubject: 'Hello {{firstName}}',
      templateSnapshotHtml: '<p>Hi {{firstName}}</p>',
      correlationHeader: SEND_CORRELATION_HEADER,
    });

    expect(send.id).toBe(parseSendId(sendId));
    expect(send.to).toBe('alice@example.com');

    expect(() =>
      createIndividualSendDto({
        to: 'alice@example.com',
        state: SendState.Queued,
        templateSnapshotSubject: '',
        templateSnapshotHtml: '<p>body</p>',
        correlationHeader: SEND_CORRELATION_HEADER,
      }),
    ).toThrow('Template snapshot subject is required');
  });

  it('creates routing, event, suppression and webhook-aligned DTOs with invariants', () => {
    const sendId = createUlid();
    const event = createDeliveryEventDto({
      sendId,
      type: DeliveryEventType.AcceptedByMta,
      providerEventId: 'evt-1',
      provenance: 'postfix-log',
      smtpReplyCode: '250',
      smtpEnhancedCode: '2.0.0',
    });

    const suppression = createSuppressionEntryDto({
      email: ' HardBounce@Example.com ',
      reason: SuppressionReason.HardBounce,
      sourceEventId: event.id,
    });

    expect(suppression.email).toBe('hardbounce@example.com');

    const rule = createRoutingRuleDto({
      type: RoutingRuleType.ExactDomain,
      recipientDomain: 'GMAIL.COM',
      smtpNodeKey: 'smtp-gmail-1',
      priority: 10,
      version: 1,
    });

    expect(rule.recipientDomain).toBe('gmail.com');

    expect(() =>
      createRoutingRuleDto({
        type: RoutingRuleType.DefaultFallback,
        recipientDomain: 'example.com',
        smtpNodeKey: 'smtp-default',
        priority: 1,
        version: 1,
      }),
    ).toThrow('Default fallback routing cannot include recipientDomain');

    const subscriber = createSubscriberDto({
      email: 'Bob@Example.com',
      isUnsubscribed: true,
    });

    expect(subscriber.isUnsubscribed).toBe(true);
    expect(normalizeEmailAddress(' Foo@Example.com ')).toBe('foo@example.com');
    expect(WebhookEventType.SendStatusChanged).toBe('send_status_changed');
  });
});
