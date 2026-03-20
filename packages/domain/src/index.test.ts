import { describe, expect, it } from 'vitest';

import { DeliveryEventType, SendState, createDeliveryEventId, createSendId } from '@supermailer/contracts';

import {
  SendStateTransitionError,
  type SendAggregate,
  applyDeliveryEvent,
  applySendStateTransition,
  canTransitionSendState,
  describeWorkspace,
} from './index';

describe('send-state-machine', () => {
  it('describes the shared workspace runtime', () => {
    expect(describeWorkspace().runtime).toBe('pnpm-turbo-typescript');
  });

  it('allows all canonical state transitions', () => {
    expect(canTransitionSendState(SendState.Draft, SendState.Queued)).toBe(true);
    expect(canTransitionSendState(SendState.Queued, SendState.Dispatching)).toBe(true);
    expect(canTransitionSendState(SendState.Dispatching, SendState.AcceptedByMta)).toBe(true);
    expect(canTransitionSendState(SendState.AcceptedByMta, SendState.Delivered)).toBe(true);
    expect(canTransitionSendState(SendState.Dispatching, SendState.Deferred)).toBe(true);
    expect(canTransitionSendState(SendState.Deferred, SendState.Dispatching)).toBe(true);
    expect(canTransitionSendState(SendState.Dispatching, SendState.FailedTransient)).toBe(true);
    expect(canTransitionSendState(SendState.Dispatching, SendState.FailedPermanent)).toBe(true);
    expect(canTransitionSendState(SendState.AcceptedByMta, SendState.Bounced)).toBe(true);
  });

  it('rejects disallowed transitions', () => {
    expect(() => applySendStateTransition(SendState.Delivered, SendState.Deferred)).toThrow(SendStateTransitionError);
    expect(() => applySendStateTransition(SendState.Queued, SendState.Delivered)).toThrow('Transition not allowed');
    expect(canTransitionSendState(SendState.Bounced, SendState.Dispatching)).toBe(false);
  });

  it('accepts happy-path events in order', () => {
    const sendId = createSendId();
    let aggregate: SendAggregate = {
      id: sendId,
      state: SendState.Queued,
      stateUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
      processedProviderEventIds: new Set<string>(),
      ignoredProviderEventIds: new Set<string>(),
      history: [],
    };

    const events = [
      {
        id: createDeliveryEventId(),
        sendId,
        providerEventId: 'evt-dispatching',
        type: DeliveryEventType.Dispatching,
        occurredAt: new Date('2026-01-01T00:01:00.000Z'),
      },
      {
        id: createDeliveryEventId(),
        sendId,
        providerEventId: 'evt-accepted',
        type: DeliveryEventType.AcceptedByMta,
        occurredAt: new Date('2026-01-01T00:02:00.000Z'),
      },
      {
        id: createDeliveryEventId(),
        sendId,
        providerEventId: 'evt-delivered',
        type: DeliveryEventType.Delivered,
        occurredAt: new Date('2026-01-01T00:03:00.000Z'),
      },
    ];

    for (const event of events) {
      const result = applyDeliveryEvent(aggregate, event);
      expect(result.outcome).toBe('applied');
      aggregate = result.aggregate;
    }

    expect(aggregate.state).toBe(SendState.Delivered);
    expect(aggregate.history).toHaveLength(3);
  });
});
