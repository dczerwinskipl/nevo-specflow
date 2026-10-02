import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(nodeScrypt);

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
  if (salt.length === 0) {
    throw new Error('Password hash salt must not be empty.');
  }

  const derived = await derive(password, salt, COST, BLOCK_SIZE, PARALLELIZATION);

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

  const actual = await derive(
    password,
    parsed.salt,
    parsed.cost,
    parsed.blockSize,
    parsed.parallelization,
    parsed.expected.length,
  );

  return actual.length === parsed.expected.length && timingSafeEqual(actual, parsed.expected);
}

export function isSupportedPasswordHash(value: string): boolean {
  return parsePasswordHash(value) !== null;
}

interface ParsedPasswordHash {
  readonly cost: number;
  readonly blockSize: number;
  readonly parallelization: number;
  readonly salt: Buffer;
  readonly expected: Buffer;
}

function parsePasswordHash(value: string): ParsedPasswordHash | null {
  const parts = value.split('$');
  if (parts.length !== 7 || parts[0] !== '' || parts[1] !== FORMAT) {
    return null;
  }

  const cost = parsePositiveInteger(parts[2]);
  const blockSize = parsePositiveInteger(parts[3]);
  const parallelization = parsePositiveInteger(parts[4]);
  const salt = decodeBase64Url(parts[5]);
  const expected = decodeBase64Url(parts[6]);

  if (!cost || !blockSize || !parallelization || !salt || !expected || expected.length === 0) {
    return null;
  }

  return { cost, blockSize, parallelization, salt, expected };
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/u.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function decodeBase64Url(value: string | undefined): Buffer | null {
  if (!value) {
    return null;
  }

  try {
    return Buffer.from(value, 'base64url');
  } catch {
    return null;
  }
}

async function derive(
  password: string,
  salt: Uint8Array,
  cost: number,
  blockSize: number,
  parallelization: number,
  keyLength = KEY_LENGTH,
): Promise<Buffer> {
  const result = await scrypt(password, salt, keyLength, {
    cost,
    blockSize,
    parallelization,
  });

  return Buffer.from(result);
}

function assertPassword(password: string): void {
  if (password.length === 0) {
    throw new Error('Password must not be empty.');
  }
}
