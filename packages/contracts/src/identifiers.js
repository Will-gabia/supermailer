const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const encodeCrockford = (value, length) => {
    let remaining = value;
    let encoded = '';
    for (let index = 0; index < length; index += 1) {
        encoded = ULID_ALPHABET[remaining % 32] + encoded;
        remaining = Math.floor(remaining / 32);
    }
    return encoded;
};
const createRandomPart = (length) => {
    let result = '';
    for (let index = 0; index < length; index += 1) {
        const randomIndex = Math.floor(Math.random() * ULID_ALPHABET.length);
        result += ULID_ALPHABET[randomIndex];
    }
    return result;
};
export const SEND_CORRELATION_HEADER = 'X-Supermailer-Send-Id';
const parseEntityId = (value, entityName) => {
    const parsed = parseUlid(value);
    if (!parsed) {
        throw new Error(`${entityName} must be a valid ULID`);
    }
    return parsed;
};
export const createUlid = () => {
    const timestampPart = encodeCrockford(Date.now(), 10);
    const randomPart = createRandomPart(16);
    return `${timestampPart}${randomPart}`;
};
export const isUlid = (value) => ULID_PATTERN.test(value);
export const parseUlid = (value) => {
    if (!ULID_PATTERN.test(value)) {
        return null;
    }
    return value;
};
export const createSubscriberId = () => createUlid();
export const createTemplateId = () => createUlid();
export const createCampaignId = () => createUlid();
export const createSendId = () => createUlid();
export const createRoutingRuleId = () => createUlid();
export const createDeliveryAttemptId = () => createUlid();
export const createDeliveryEventId = () => createUlid();
export const createWebhookEndpointId = () => createUlid();
export const createSuppressionEntryId = () => createUlid();
export const parseSubscriberId = (value) => parseEntityId(value, 'SubscriberId');
export const parseTemplateId = (value) => parseEntityId(value, 'TemplateId');
export const parseCampaignId = (value) => parseEntityId(value, 'CampaignId');
export const parseSendId = (value) => parseEntityId(value, 'SendId');
export const parseRoutingRuleId = (value) => parseEntityId(value, 'RoutingRuleId');
export const parseDeliveryAttemptId = (value) => parseEntityId(value, 'DeliveryAttemptId');
export const parseDeliveryEventId = (value) => parseEntityId(value, 'DeliveryEventId');
export const parseWebhookEndpointId = (value) => parseEntityId(value, 'WebhookEndpointId');
export const parseSuppressionEntryId = (value) => parseEntityId(value, 'SuppressionEntryId');
