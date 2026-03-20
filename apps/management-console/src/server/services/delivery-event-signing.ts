import { createHmac, timingSafeEqual } from 'node:crypto';

import type { ManagementConsoleAppContext } from '../app-context';

const INBOUND_CALLBACK_PURPOSE = 'internal-delivery-callback';
const OUTBOUND_RESULT_WEBHOOK_PURPOSE = 'outbound-result-webhook';

const createSignature = (
  secret: string,
  purpose: string,
  payload: string,
): string =>
  createHmac('sha256', `${purpose}:${secret}`).update(payload).digest('hex');

const secureEquals = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
};

export const signInboundDeliveryCallbackPayload = (
  appContext: ManagementConsoleAppContext,
  payload: string,
): string =>
  createSignature(
    appContext.env.authTokenSecret,
    INBOUND_CALLBACK_PURPOSE,
    payload,
  );

export const verifyInboundDeliveryCallbackSignature = (
  appContext: ManagementConsoleAppContext,
  payload: string,
  signature: string | null | undefined,
): boolean => {
  if (!signature?.trim()) {
    return false;
  }

  return secureEquals(
    signInboundDeliveryCallbackPayload(appContext, payload),
    signature.trim(),
  );
};

export const signOutboundResultWebhookPayload = (
  signingSecret: string,
  payload: string,
): string =>
  createSignature(signingSecret, OUTBOUND_RESULT_WEBHOOK_PURPOSE, payload);
