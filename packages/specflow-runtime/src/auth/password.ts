import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';

const FORMAT = 'scrypt';
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

export interface PasswordHashOptions {
  readonly salt?: Uint8Array;
}

export async function hashPassword(
  password: string,
  options: PasswordHashOptions = {},
): Promise<string> {
  assertPassword(password);

  const salt = options.salt ? Buffer.from(options.salt) : randomBytes(SALT_LENGTH);
  if (salt.length !== SALT_LENGTH) {
    throw new Error(`Password hash salt must be exactly ${SALT_LENGTH} bytes.`);
  }

  const derived = await derive(password, salt);

  return [
    '',
    FORMAT,
    String(COST),
    String(BLOCK_SIZE),
    String(PARALLELIZATION),
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  if (password.length === 0) {
    return false;
  }

  const parsed = parsePasswordHash(encodedHash);
  if (!parsed) {
    return false;
  }

  const actual = await derive(password, parsed.salt);

  return timingSafeEqual(actual, parsed.expected);
}

export function isSupportedPasswordHash(value: string): boolean {
  return parsePasswordHash(value) !== null;
}

interface ParsedPasswordHash {
  readonly salt: Buffer;
  readonly expected: Buffer;
}

function parsePasswordHash(value: string): ParsedPasswordHash | null {
  const parts = value.split('$');
  if (
    parts.length !== 7 ||
    parts[0] !== '' ||
    parts[1] !== FORMAT ||
    parts[2] !== String(COST) ||
    parts[3] !== String(BLOCK_SIZE) ||
    parts[4] !== String(PARALLELIZATION)
  ) {
    return null;
  }

  const salt = decodeBase64Url(parts[5], SALT_LENGTH);
  const expected = decodeBase64Url(parts[6], KEY_LENGTH);

  if (!salt || !expected) {
    return null;
  }

  return { salt, expected };
}

function decodeBase64Url(value: string | undefined, expectedLength: number): Buffer | null {
  if (!value || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    return null;
  }

  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== expectedLength || decoded.toString('base64url') !== value) {
    return null;
  }

  return decoded;
}

function derive(password: string, salt: Uint8Array): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(
      password,
      salt,
      KEY_LENGTH,
      {
        cost: COST,
        blockSize: BLOCK_SIZE,
        parallelization: PARALLELIZATION,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

function assertPassword(password: string): void {
  if (password.length === 0) {
    throw new Error('Password must not be empty.');
  }
}
