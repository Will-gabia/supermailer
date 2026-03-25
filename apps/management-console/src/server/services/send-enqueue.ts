import { createHmac } from 'node:crypto';

import { createUlid, normalizeEmailAddress } from '@supermailer/contracts';

import type { ManagementConsoleAppContext } from '../app-context';

const createDeterministicSendId = (
  scopeSeed: string,
  recipientEmail: string,
): string => {
  const digest = createHmac('sha256', `${scopeSeed}:${recipientEmail}`)
    .update('supermailer-send')
    .digest('hex')
    .toUpperCase();
  const canonical = digest.replace(/[^0-9A-Z]/g, '').replace(/[ILOU]/g, 'A');
  const encoded = `${canonical}ZZZZZZZZZZZZZZZZZZZZZZZZZZ`.slice(0, 26);

  return encoded;
};

const createDeterministicSigningSecret = (seed: string): string =>
  createHmac('sha256', 'supermailer-individual-webhook')
    .update(seed)
    .digest('hex');

export type IndividualSendInput = {
  to: string;
  apiKeyId?: string;
  subject?: string;
  html?: string;
  text?: string;
  callbackEndpoint?: {
    id: string;
    targetUrl: string;
    signingSecret: string;
  };
  webhookUrl?: string;
  webhookSigningSecret?: string;
};

export type IndividualSendResult = {
  sendId: string;
  status: 'queued';
  queueJobId: string;
  recipient: string;
  callbackEndpointId: string | null;
  webhook: {
    targetUrl: string;
    signingSecret: string;
  } | null;
};

export type RenderedSendInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  apiKeyId: string;
  callbackEndpoint?: {
    id: string;
    targetUrl: string;
    signingSecret: string;
  };
};

export type RenderedSendResult = {
  sendId: string;
  status: 'queued';
  queueJobId: string;
  recipient: string;
  callbackEndpointId: string | null;
};

export type RawEmlSendInput = {
  eml: string;
  apiKeyId: string;
  callbackEndpoint?: {
    id: string;
    targetUrl: string;
    signingSecret: string;
  };
};

type EnqueueDependencies = {
  enqueueSend(sendId: string): Promise<{ jobId: string }>;
};

const parseRawEml = (
  eml: string,
): { recipientEmail: string; subject: string } => {
  const normalizedEml = eml.trim();

  if (!normalizedEml || !/(\r?\n){2}/.test(normalizedEml)) {
    throw new Error('eml must contain headers and body');
  }

  const toHeader = normalizedEml.match(/^To:\s*(.+)$/im)?.[1]?.trim() ?? '';
  const subjectHeader =
    normalizedEml.match(/^Subject:\s*(.+)$/im)?.[1]?.trim() ?? '';
  const recipientMatch = toHeader.match(
    /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
  );

  if (!recipientMatch?.[1] || !subjectHeader) {
    throw new Error('eml must include valid To and Subject headers');
  }

  return {
    recipientEmail: normalizeEmailAddress(recipientMatch[1]),
    subject: subjectHeader,
  };
};

export const enqueueIndividualSend = async (
  appContext: ManagementConsoleAppContext,
  dependencies: EnqueueDependencies,
  input: IndividualSendInput,
): Promise<IndividualSendResult> => {
  const normalizedRecipient = normalizeEmailAddress(input.to);
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const html = typeof input.html === 'string' ? input.html.trim() : '';
  const text =
    typeof input.text === 'string' && input.text.trim()
      ? input.text.trim()
      : null;

  if (!subject || !html) {
    throw new Error('subject and html are required');
  }

  const sendSeed = createUlid();
  const sendId = createDeterministicSendId(sendSeed, normalizedRecipient);
  const route =
    await appContext.repositories.routingRules.findRouteForRecipient(
      normalizedRecipient,
    );

  const created = await appContext.repositories.sends.create({
    id: sendId,
    kind: 'individual',
    recipientEmail: normalizedRecipient,
    subjectSnapshot: subject,
    htmlSnapshot: html,
    textSnapshot: text,
    status: 'queued',
    apiKeyId: input.apiKeyId ?? null,
    templateId: null,
    callbackEndpointId: input.callbackEndpoint?.id ?? null,
    routingRuleVersion: route?.rule.version ?? null,
    sendSmtpNodeId: route?.node.id ?? null,
  });

  const enqueued = await dependencies.enqueueSend(created.id);
  await appContext.repositories.sends.setQueueJobId(created.id, enqueued.jobId);

  const webhookUrl =
    input.callbackEndpoint?.targetUrl ??
    (typeof input.webhookUrl === 'string' ? input.webhookUrl.trim() : '');
  let webhook: { targetUrl: string; signingSecret: string } | null = null;

  if (webhookUrl) {
    const signingSecret =
      input.callbackEndpoint?.signingSecret ??
      (typeof input.webhookSigningSecret === 'string' &&
      input.webhookSigningSecret.trim()
        ? input.webhookSigningSecret.trim()
        : createDeterministicSigningSecret(`${sendId}:${webhookUrl}`));

    await appContext.repositories.outboundWebhookDeliveries.create({
      id: createUlid(),
      sendId: created.id,
      targetUrl: webhookUrl,
      signingSecret,
      status: 'pending',
      payload: {
        sendId: created.id,
        recipientEmail: normalizedRecipient,
      },
    });

    webhook = {
      targetUrl: webhookUrl,
      signingSecret,
    };
  }

  return {
    sendId: created.id,
    status: 'queued',
    queueJobId: enqueued.jobId,
    recipient: normalizedRecipient,
    callbackEndpointId: input.callbackEndpoint?.id ?? null,
    webhook,
  };
};

export const enqueueRenderedSend = async (
  appContext: ManagementConsoleAppContext,
  dependencies: EnqueueDependencies,
  input: RenderedSendInput,
): Promise<RenderedSendResult> => {
  const normalizedRecipient = normalizeEmailAddress(input.to);
  const subject = input.subject.trim();
  const html = input.html.trim();
  const text =
    typeof input.text === 'string' && input.text.trim()
      ? input.text.trim()
      : null;

  if (!subject || !html) {
    throw new Error('subject and html are required');
  }

  const sendSeed = createUlid();
  const sendId = createDeterministicSendId(sendSeed, normalizedRecipient);
  const route =
    await appContext.repositories.routingRules.findRouteForRecipient(
      normalizedRecipient,
    );

  const created = await appContext.repositories.sends.create({
    id: sendId,
    kind: 'individual',
    recipientEmail: normalizedRecipient,
    subjectSnapshot: subject,
    htmlSnapshot: html,
    textSnapshot: text,
    status: 'queued',
    apiKeyId: input.apiKeyId,
    templateId: null,
    callbackEndpointId: input.callbackEndpoint?.id ?? null,
    routingRuleVersion: route?.rule.version ?? null,
    sendSmtpNodeId: route?.node.id ?? null,
  });

  const enqueued = await dependencies.enqueueSend(created.id);
  await appContext.repositories.sends.setQueueJobId(created.id, enqueued.jobId);

  if (input.callbackEndpoint) {
    await appContext.repositories.outboundWebhookDeliveries.create({
      id: createUlid(),
      sendId: created.id,
      targetUrl: input.callbackEndpoint.targetUrl,
      signingSecret: input.callbackEndpoint.signingSecret,
      status: 'pending',
      payload: {
        sendId: created.id,
        recipientEmail: normalizedRecipient,
      },
    });
  }

  return {
    sendId: created.id,
    status: 'queued',
    queueJobId: enqueued.jobId,
    recipient: normalizedRecipient,
    callbackEndpointId: input.callbackEndpoint?.id ?? null,
  };
};

export const enqueueRawEmlSend = async (
  appContext: ManagementConsoleAppContext,
  dependencies: EnqueueDependencies,
  input: RawEmlSendInput,
): Promise<RenderedSendResult> => {
  const rawEml = input.eml.trim();
  const parsed = parseRawEml(rawEml);
  const sendSeed = createUlid();
  const sendId = createDeterministicSendId(sendSeed, parsed.recipientEmail);
  const route =
    await appContext.repositories.routingRules.findRouteForRecipient(
      parsed.recipientEmail,
    );

  const created = await appContext.repositories.sends.create({
    id: sendId,
    kind: 'individual',
    recipientEmail: parsed.recipientEmail,
    subjectSnapshot: parsed.subject,
    htmlSnapshot: rawEml,
    textSnapshot: null,
    emlSnapshot: rawEml,
    status: 'queued',
    apiKeyId: input.apiKeyId,
    templateId: null,
    callbackEndpointId: input.callbackEndpoint?.id ?? null,
    routingRuleVersion: route?.rule.version ?? null,
    sendSmtpNodeId: route?.node.id ?? null,
  });

  const enqueued = await dependencies.enqueueSend(created.id);
  await appContext.repositories.sends.setQueueJobId(created.id, enqueued.jobId);

  if (input.callbackEndpoint) {
    await appContext.repositories.outboundWebhookDeliveries.create({
      id: createUlid(),
      sendId: created.id,
      targetUrl: input.callbackEndpoint.targetUrl,
      signingSecret: input.callbackEndpoint.signingSecret,
      status: 'pending',
      payload: {
        sendId: created.id,
        recipientEmail: parsed.recipientEmail,
      },
    });
  }

  return {
    sendId: created.id,
    status: 'queued',
    queueJobId: enqueued.jobId,
    recipient: parsed.recipientEmail,
    callbackEndpointId: input.callbackEndpoint?.id ?? null,
  };
};
