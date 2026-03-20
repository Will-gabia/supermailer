import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

const toBase64Url = (buffer: Buffer): string => buffer.toString('base64url');

export const hashSecretValue = (secret: string, value: string, purpose: string): string =>
  createHmac('sha256', `${purpose}:${secret}`).update(value).digest('hex');

export const createSessionToken = (): string => `sms_${toBase64Url(randomBytes(32))}`;

export const createApiKeyValue = (): { rawKey: string; keyPrefix: string } => {
  const keyPrefix = `sm_${randomBytes(6).toString('hex')}`;
  const secret = toBase64Url(randomBytes(24));

  return {
    rawKey: `${keyPrefix}_${secret}`,
    keyPrefix,
  };
};

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;

  return `scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
};

export const verifyPassword = async (password: string, storedHash: string): Promise<boolean> => {
  const [algorithm, saltHex, hashHex] = storedHash.split('$');

  if (algorithm !== 'scrypt' || !saltHex || !hashHex) {
    return false;
  }

  const expected = Buffer.from(hashHex, 'hex');
  const actual = (await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length)) as Buffer;

  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
};

export const parseApiKeyPrefix = (rawKey: string): string | null => {
  const separatorIndex = rawKey.indexOf('_', 3);

  if (!rawKey.startsWith('sm_') || separatorIndex === -1) {
    return null;
  }

  return rawKey.slice(0, separatorIndex);
};
