const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const encodeCrockford = (value: number, length: number): string => {
  let remaining = value;
  let encoded = '';

  for (let index = 0; index < length; index += 1) {
    encoded = ULID_ALPHABET[remaining % 32] + encoded;
    remaining = Math.floor(remaining / 32);
  }

  return encoded;
};

const createRandomPart = (length: number): string => {
  let result = '';

  for (let index = 0; index < length; index += 1) {
    const randomIndex = Math.floor(Math.random() * ULID_ALPHABET.length);
    result += ULID_ALPHABET[randomIndex];
  }

  return result;
};

export const SEND_CORRELATION_HEADER = 'X-Supermailer-Send-Id';

export type Ulid = string & { readonly __brand: 'Ulid' };

export type SubscriberId = Ulid & { readonly __entity: 'SubscriberId' };
export type TemplateId = Ulid & { readonly __entity: 'TemplateId' };
export type CampaignId = Ulid & { readonly __entity: 'CampaignId' };
export type SendId = Ulid & { readonly __entity: 'SendId' };
export type RoutingRuleId = Ulid & { readonly __entity: 'RoutingRuleId' };
export type DeliveryAttemptId = Ulid & { readonly __entity: 'DeliveryAttemptId' };
export type DeliveryEventId = Ulid & { readonly __entity: 'DeliveryEventId' };
export type WebhookEndpointId = Ulid & { readonly __entity: 'WebhookEndpointId' };
export type SuppressionEntryId = Ulid & { readonly __entity: 'SuppressionEntryId' };

const parseEntityId = <T extends Ulid>(value: string, entityName: string): T => {
  const parsed = parseUlid(value);

  if (!parsed) {
    throw new Error(`${entityName} must be a valid ULID`);
  }

  return parsed as T;
};

export const createUlid = (): Ulid => {
  const timestampPart = encodeCrockford(Date.now(), 10);
  const randomPart = createRandomPart(16);

  return `${timestampPart}${randomPart}` as Ulid;
};

export const isUlid = (value: string): boolean => ULID_PATTERN.test(value);

export const parseUlid = (value: string): Ulid | null => {
  if (!ULID_PATTERN.test(value)) {
    return null;
  }

  return value as Ulid;
};

export const createSubscriberId = (): SubscriberId => createUlid() as SubscriberId;
export const createTemplateId = (): TemplateId => createUlid() as TemplateId;
export const createCampaignId = (): CampaignId => createUlid() as CampaignId;
export const createSendId = (): SendId => createUlid() as SendId;
export const createRoutingRuleId = (): RoutingRuleId => createUlid() as RoutingRuleId;
export const createDeliveryAttemptId = (): DeliveryAttemptId => createUlid() as DeliveryAttemptId;
export const createDeliveryEventId = (): DeliveryEventId => createUlid() as DeliveryEventId;
export const createWebhookEndpointId = (): WebhookEndpointId => createUlid() as WebhookEndpointId;
export const createSuppressionEntryId = (): SuppressionEntryId => createUlid() as SuppressionEntryId;

export const parseSubscriberId = (value: string): SubscriberId => parseEntityId<SubscriberId>(value, 'SubscriberId');
export const parseTemplateId = (value: string): TemplateId => parseEntityId<TemplateId>(value, 'TemplateId');
export const parseCampaignId = (value: string): CampaignId => parseEntityId<CampaignId>(value, 'CampaignId');
export const parseSendId = (value: string): SendId => parseEntityId<SendId>(value, 'SendId');
export const parseRoutingRuleId = (value: string): RoutingRuleId => parseEntityId<RoutingRuleId>(value, 'RoutingRuleId');
export const parseDeliveryAttemptId = (value: string): DeliveryAttemptId =>
  parseEntityId<DeliveryAttemptId>(value, 'DeliveryAttemptId');
export const parseDeliveryEventId = (value: string): DeliveryEventId => parseEntityId<DeliveryEventId>(value, 'DeliveryEventId');
export const parseWebhookEndpointId = (value: string): WebhookEndpointId =>
  parseEntityId<WebhookEndpointId>(value, 'WebhookEndpointId');
export const parseSuppressionEntryId = (value: string): SuppressionEntryId =>
  parseEntityId<SuppressionEntryId>(value, 'SuppressionEntryId');
