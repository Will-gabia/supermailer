import { describe, expect, it } from 'vitest';

import { DeliveryEventType, SendState, createDeliveryEventId, createSendId } from '@supermailer/contracts';

import { applyDeliveryEvent } from './index';

describe('terminal-state-monotonicity', () => {
  it('ignores duplicate provider events', () => {
    const sendId = createSendId();
    const aggregate = {
      id: sendId,
      state: SendState.Dispatching,
      stateUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
      processedProviderEventIds: new Set<string>(),
      ignoredProviderEventIds: new Set<string>(),
      history: [],
    };

    const event = {
      id: createDeliveryEventId(),
      sendId,
      providerEventId: 'evt-accepted-001',
      type: DeliveryEventType.AcceptedByMta,
      occurredAt: new Date('2026-01-01T00:01:00.000Z'),
    };

    const first = applyDeliveryEvent(aggregate, event);
    const duplicate = applyDeliveryEvent(first.aggregate, event);

    expect(first.outcome).toBe('applied');
    expect(duplicate.outcome).toBe('ignored_duplicate');
    expect(duplicate.aggregate.history).toHaveLength(1);
  });

  it('protects delivered from stale deferred events', () => {
    const sendId = createSendId();
    const aggregate = {
      id: sendId,
      state: SendState.Delivered,
      stateUpdatedAt: new Date('2026-01-01T00:10:00.000Z'),
      processedProviderEventIds: new Set<string>(['evt-delivered-001']),
      ignoredProviderEventIds: new Set<string>(),
      history: [],
    };

    const staleDeferred = {
      id: createDeliveryEventId(),
      sendId,
      providerEventId: 'evt-deferred-002',
      type: DeliveryEventType.Deferred,
      occurredAt: new Date('2026-01-01T00:09:00.000Z'),
    };

    const result = applyDeliveryEvent(aggregate, staleDeferred);

    expect(result.outcome).toBe('ignored_stale');
    expect(result.aggregate.state).toBe(SendState.Delivered);
    expect(result.aggregate.ignoredProviderEventIds.has('evt-deferred-002')).toBe(true);
  });
});
