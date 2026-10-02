import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';

const FORMAT = 'scrypt';
const CURRENT_COST = 16_384;
const CURRENT_BLOCK_SIZE = 8;
const CURRENT_PARALLELIZATION = 5;
const LEGACY_PARALLELIZATION = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const MAX_MEMORY = 64 * 1024 * 1024;

interface PasswordHashParameters {
  readonly cost: number;
  readonly blockSize: number;
  readonly parallelization: number;
}

const CURRENT_PARAMETERS: PasswordHashParameters = {
  cost: CURRENT_COST,
  blockSize: CURRENT_BLOCK_SIZE,
  parallelization: CURRENT_PARALLELIZATION,
};

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

  const derived = await derive(password, salt, CURRENT_PARAMETERS);

  return [
    '',
    FORMAT,
    String(CURRENT_PARAMETERS.cost),
    String(CURRENT_PARAMETERS.blockSize),
    String(CURRENT_PARAMETERS.parallelization),
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

  const actual = await derive(password, parsed.salt, parsed.parameters);
  return timingSafeEqual(actual, parsed.expected);
}

export function isSupportedPasswordHash(value: string): boolean {
  return parsePasswordHash(value) !== null;
}

interface ParsedPasswordHash {
  readonly parameters: PasswordHashParameters;
  readonly salt: Buffer;
  readonly expected: Buffer;
}

function parsePasswordHash(value: string): ParsedPasswordHash | null {
  const parts = value.split('$');
  if (parts.length !== 7 || parts[0] !== '' || parts[1] !== FORMAT) {
    return null;
  }

  const cost = parseInteger(parts[2]);
  const blockSize = parseInteger(parts[3]);
  const parallelization = parseInteger(parts[4]);
  if (
    cost === null ||
    blockSize === null ||
    parallelization === null ||
    !isSupportedParameters({ cost, blockSize, parallelization })
  ) {
    return null;
  }

  const salt = decodeBase64Url(parts[5], SALT_LENGTH);
  const expected = decodeBase64Url(parts[6], KEY_LENGTH);
  if (!salt || !expected) {
    return null;
  }

  return {
    parameters: { cost, blockSize, parallelization },
    salt,
    expected,
  };
}

function isSupportedParameters(parameters: PasswordHashParameters): boolean {
  return (
    parameters.cost === CURRENT_COST &&
    parameters.blockSize === CURRENT_BLOCK_SIZE &&
    (parameters.parallelization === CURRENT_PARALLELIZATION ||
      parameters.parallelization === LEGACY_PARALLELIZATION)
  );
}

function parseInteger(value: string | undefined): number | null {
  if (!value || !/^[1-9][0-9]*$/u.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
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

function derive(
  password: string,
  salt: Uint8Array,
  parameters: PasswordHashParameters,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(
      password,
      salt,
      KEY_LENGTH,
      {
        cost: parameters.cost,
        blockSize: parameters.blockSize,
        parallelization: parameters.parallelization,
        maxmem: MAX_MEMORY,
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
