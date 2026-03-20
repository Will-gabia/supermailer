import {
  DeliveryEventType,
  SendState,
  type DeliveryEventId,
  type SendId,
} from '@supermailer/contracts';

export class SendStateTransitionError extends Error {
  public readonly code = 'SEND_STATE_TRANSITION_NOT_ALLOWED';

  public constructor(from: SendState, to: SendState) {
    super(`Transition not allowed: ${from} -> ${to}`);
  }
}

export type DeliveryEventRecord = {
  id: DeliveryEventId;
  sendId: SendId;
  providerEventId: string;
  type: DeliveryEventType;
  occurredAt: Date;
};

export type SendAggregate = {
  id: SendId;
  state: SendState;
  stateUpdatedAt: Date;
  processedProviderEventIds: ReadonlySet<string>;
  ignoredProviderEventIds: ReadonlySet<string>;
  history: ReadonlyArray<DeliveryEventRecord>;
};

export type ApplyDeliveryEventResult =
  | {
      aggregate: SendAggregate;
      outcome: 'applied';
    }
  | {
      aggregate: SendAggregate;
      outcome: 'ignored_duplicate';
      reason: 'provider_event_already_processed';
    }
  | {
      aggregate: SendAggregate;
      outcome: 'ignored_stale';
      reason: 'event_out_of_order_or_regressive';
    };

const SEND_TRANSITIONS: Readonly<Record<SendState, ReadonlySet<SendState>>> = {
  [SendState.Draft]: new Set([SendState.Queued]),
  [SendState.Queued]: new Set([SendState.Dispatching]),
  [SendState.Dispatching]: new Set([
    SendState.AcceptedByMta,
    SendState.Deferred,
    SendState.FailedTransient,
    SendState.FailedPermanent,
  ]),
  [SendState.Deferred]: new Set([SendState.Dispatching]),
  [SendState.AcceptedByMta]: new Set([SendState.Delivered, SendState.Bounced]),
  [SendState.Delivered]: new Set([]),
  [SendState.Bounced]: new Set([]),
  [SendState.FailedTransient]: new Set([]),
  [SendState.FailedPermanent]: new Set([]),
};

const EVENT_TO_STATE: Readonly<Record<DeliveryEventType, SendState>> = {
  [DeliveryEventType.Queued]: SendState.Queued,
  [DeliveryEventType.Dispatching]: SendState.Dispatching,
  [DeliveryEventType.Deferred]: SendState.Deferred,
  [DeliveryEventType.AcceptedByMta]: SendState.AcceptedByMta,
  [DeliveryEventType.Delivered]: SendState.Delivered,
  [DeliveryEventType.Bounced]: SendState.Bounced,
  [DeliveryEventType.FailedTransient]: SendState.FailedTransient,
  [DeliveryEventType.FailedPermanent]: SendState.FailedPermanent,
};

export const SEND_TERMINAL_STATES: ReadonlySet<SendState> = new Set([
  SendState.Delivered,
  SendState.Bounced,
  SendState.FailedTransient,
  SendState.FailedPermanent,
]);

export const SEND_STATE_ORDER: Readonly<Record<SendState, number>> = {
  [SendState.Draft]: 0,
  [SendState.Queued]: 1,
  [SendState.Dispatching]: 2,
  [SendState.Deferred]: 3,
  [SendState.AcceptedByMta]: 4,
  [SendState.Delivered]: 5,
  [SendState.Bounced]: 5,
  [SendState.FailedTransient]: 3,
  [SendState.FailedPermanent]: 3,
};

export const isTerminalSendState = (state: SendState): boolean =>
  SEND_TERMINAL_STATES.has(state);

export const getSendStateForDeliveryEventType = (
  eventType: DeliveryEventType,
): SendState => EVENT_TO_STATE[eventType];

export const canTransitionSendState = (
  from: SendState,
  to: SendState,
): boolean => SEND_TRANSITIONS[from].has(to);

export const applySendStateTransition = (
  state: SendState,
  nextState: SendState,
): SendState => {
  if (!canTransitionSendState(state, nextState)) {
    throw new SendStateTransitionError(state, nextState);
  }

  return nextState;
};

const cloneWithIgnoredEvent = (
  aggregate: SendAggregate,
  providerEventId: string,
): SendAggregate => ({
  ...aggregate,
  ignoredProviderEventIds: new Set([
    ...aggregate.ignoredProviderEventIds,
    providerEventId,
  ]),
});

export const applyDeliveryEvent = (
  aggregate: SendAggregate,
  event: DeliveryEventRecord,
): ApplyDeliveryEventResult => {
  if (aggregate.id !== event.sendId) {
    throw new Error('Delivery event sendId does not match aggregate');
  }

  if (aggregate.processedProviderEventIds.has(event.providerEventId)) {
    return {
      aggregate,
      outcome: 'ignored_duplicate',
      reason: 'provider_event_already_processed',
    };
  }

  const nextState = EVENT_TO_STATE[event.type];

  if (!canTransitionSendState(aggregate.state, nextState)) {
    return {
      aggregate: cloneWithIgnoredEvent(aggregate, event.providerEventId),
      outcome: 'ignored_stale',
      reason: 'event_out_of_order_or_regressive',
    };
  }

  const nextAggregate: SendAggregate = {
    ...aggregate,
    state: nextState,
    stateUpdatedAt: new Date(event.occurredAt),
    processedProviderEventIds: new Set([
      ...aggregate.processedProviderEventIds,
      event.providerEventId,
    ]),
    history: [...aggregate.history, event],
  };

  return {
    aggregate: nextAggregate,
    outcome: 'applied',
  };
};
