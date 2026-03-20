import { createHmac } from 'node:crypto';

import { createUlid, normalizeEmailAddress } from '@supermailer/contracts';

import type { ManagementConsoleAppContext } from '../app-context';

import { renderTemplate } from './template-preview';
import { getSubscriberEligibility } from './subscriber-eligibility';

const toObjectRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const toStringRecord = (value: unknown): Record<string, string> => {
  const source = toObjectRecord(value);

  return Object.fromEntries(Object.entries(source).filter(([, entryValue]) => typeof entryValue === 'string')) as Record<string, string>;
};

const createDeterministicSendId = (scopeSeed: string, recipientEmail: string): string => {
  const digest = createHmac('sha256', `${scopeSeed}:${recipientEmail}`).update('supermailer-send').digest('hex').toUpperCase();
  const canonical = digest.replace(/[^0-9A-Z]/g, '').replace(/[ILOU]/g, 'A');
  const encoded = `${canonical}ZZZZZZZZZZZZZZZZZZZZZZZZZZ`.slice(0, 26);

  return encoded;
};

const createDeterministicSigningSecret = (seed: string): string =>
  createHmac('sha256', 'supermailer-individual-webhook').update(seed).digest('hex');

export type IndividualSendInput = {
  to: string;
  templateId?: string;
  subject?: string;
  html?: string;
  text?: string;
  variables?: Record<string, string>;
  webhookUrl?: string;
  webhookSigningSecret?: string;
};

export type CampaignEnqueueInput = {
  campaignId?: string;
  templateId?: string;
  subject?: string;
  html?: string;
  text?: string;
  variables?: Record<string, string>;
  recipients: string[];
};

export type EnqueuedRecipient = {
  email: string;
  sendId: string;
  queueJobId: string;
  status: 'queued';
};

export type SkippedRecipient = {
  email: string;
  reason: 'unsubscribed' | 'hard_bounce_suppression';
};

export type IndividualSendResult = {
  sendId: string;
  status: 'queued' | 'skipped';
  queueJobId: string | null;
  recipient: string;
  skippedReason: 'unsubscribed' | 'hard_bounce_suppression' | null;
  webhook: {
    targetUrl: string;
    signingSecret: string;
  } | null;
};

export type CampaignEnqueueResult = {
  campaignId: string;
  status: 'accepted';
  totals: {
    requested: number;
    queued: number;
    skipped: number;
  };
  queued: EnqueuedRecipient[];
  skipped: SkippedRecipient[];
};

type RenderedSnapshot = {
  templateId: string | null;
  subject: string;
  html: string;
  text: string | null;
};

const resolveRenderedSnapshot = async (
  appContext: ManagementConsoleAppContext,
  input: {
    templateId?: string;
    subject?: string;
    html?: string;
    text?: string;
    variables?: Record<string, string>;
  },
): Promise<RenderedSnapshot> => {
  if (input.templateId) {
    const template = await appContext.repositories.templates.findById(input.templateId);

    if (!template) {
      throw new Error('Template not found');
    }

    const variables = input.variables ?? {};

    return {
      templateId: template.id,
      subject: renderTemplate(template.subject, variables),
      html: renderTemplate(template.html, variables),
      text: template.textContent ? renderTemplate(template.textContent, variables) : null,
    };
  }

  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const html = typeof input.html === 'string' ? input.html.trim() : '';

  if (!subject || !html) {
    throw new Error('Either templateId or raw subject/html is required');
  }

  return {
    templateId: null,
    subject,
    html,
    text: typeof input.text === 'string' && input.text.trim() ? input.text.trim() : null,
  };
};

type EnqueueDependencies = {
  enqueueSend(sendId: string): Promise<{ jobId: string }>;
};

export const enqueueIndividualSend = async (
  appContext: ManagementConsoleAppContext,
  dependencies: EnqueueDependencies,
  input: IndividualSendInput,
): Promise<IndividualSendResult> => {
  const normalizedRecipient = normalizeEmailAddress(input.to);
  const eligibility = await getSubscriberEligibility(appContext, normalizedRecipient);
  const sendSeed = createUlid();
  const sendId = createDeterministicSendId(sendSeed, normalizedRecipient);

  if (!eligibility.eligible && eligibility.reason) {
    return {
      sendId,
      status: 'skipped',
      queueJobId: null,
      recipient: normalizedRecipient,
      skippedReason: eligibility.reason,
      webhook: null,
    };
  }

  const snapshot = await resolveRenderedSnapshot(appContext, input);
  const route = await appContext.repositories.routingRules.findRouteForRecipient(normalizedRecipient);

  const created = await appContext.repositories.sends.create({
    id: sendId,
    kind: 'individual',
    recipientEmail: normalizedRecipient,
    subjectSnapshot: snapshot.subject,
    htmlSnapshot: snapshot.html,
    textSnapshot: snapshot.text,
    status: 'queued',
    templateId: snapshot.templateId,
    routingRuleVersion: route?.rule.version ?? null,
    sendSmtpNodeId: route?.node.id ?? null,
  });

  const enqueued = await dependencies.enqueueSend(created.id);
  await appContext.repositories.sends.setQueueJobId(created.id, enqueued.jobId);

  const webhookUrl = typeof input.webhookUrl === 'string' ? input.webhookUrl.trim() : '';
  let webhook: { targetUrl: string; signingSecret: string } | null = null;

  if (webhookUrl) {
    const signingSecret =
      typeof input.webhookSigningSecret === 'string' && input.webhookSigningSecret.trim()
        ? input.webhookSigningSecret.trim()
        : createDeterministicSigningSecret(`${sendId}:${webhookUrl}`);

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
    skippedReason: null,
    webhook,
  };
};

export const enqueueCampaignSend = async (
  appContext: ManagementConsoleAppContext,
  dependencies: EnqueueDependencies,
  input: CampaignEnqueueInput,
): Promise<CampaignEnqueueResult> => {
  const campaignId = (typeof input.campaignId === 'string' && input.campaignId.trim()) || createUlid();
  const normalizedRecipients = Array.from(new Set((Array.isArray(input.recipients) ? input.recipients : []).map((email) => normalizeEmailAddress(email))));

  if (normalizedRecipients.length === 0) {
    throw new Error('Campaign recipients are required');
  }

  const snapshot = await resolveRenderedSnapshot(appContext, {
    templateId: input.templateId,
    subject: input.subject,
    html: input.html,
    text: input.text,
    variables: toStringRecord(input.variables),
  });

  const queued: EnqueuedRecipient[] = [];
  const skipped: SkippedRecipient[] = [];

  for (const recipientEmail of normalizedRecipients) {
    const eligibility = await getSubscriberEligibility(appContext, recipientEmail);

    if (!eligibility.eligible && eligibility.reason) {
      skipped.push({
        email: recipientEmail,
        reason: eligibility.reason,
      });
      continue;
    }

    const sendId = createDeterministicSendId(campaignId, recipientEmail);
    const route = await appContext.repositories.routingRules.findRouteForRecipient(recipientEmail);
    const created = await appContext.repositories.sends.create({
      id: sendId,
      kind: 'campaign',
      recipientEmail,
      subjectSnapshot: snapshot.subject,
      htmlSnapshot: snapshot.html,
      textSnapshot: snapshot.text,
      status: 'queued',
      templateId: snapshot.templateId,
      routingRuleVersion: route?.rule.version ?? null,
      sendSmtpNodeId: route?.node.id ?? null,
    });

    const enqueued = await dependencies.enqueueSend(created.id);
    await appContext.repositories.sends.setQueueJobId(created.id, enqueued.jobId);

    queued.push({
      email: recipientEmail,
      sendId: created.id,
      queueJobId: enqueued.jobId,
      status: 'queued',
    });
  }

  return {
    campaignId,
    status: 'accepted',
    totals: {
      requested: normalizedRecipients.length,
      queued: queued.length,
      skipped: skipped.length,
    },
    queued,
    skipped,
  };
};
