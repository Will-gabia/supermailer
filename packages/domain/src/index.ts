export { describeWorkspace } from './workspace';

export {
  SEND_STATE_ORDER,
  SEND_TERMINAL_STATES,
  SendStateTransitionError,
  applyDeliveryEvent,
  applySendStateTransition,
  canTransitionSendState,
  getSendStateForDeliveryEventType,
  isTerminalSendState,
} from './send-state-machine';

export type {
  ApplyDeliveryEventResult,
  DeliveryEventRecord,
  SendAggregate,
} from './send-state-machine';
