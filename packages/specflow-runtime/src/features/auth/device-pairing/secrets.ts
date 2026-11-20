import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import {
  PAIRING_CODE_ALPHABET,
  PAIRING_CODE_LENGTH,
} from '@nevo/specflow-contracts/authentication';

/** A 256-bit bearer secret (device credential, request binding, QR token). */
export function newSecret(): string {
  return randomBytes(32).toString('base64url');
}

/** An 8-character pairing code, uniformly from the code alphabet. */
export function newPairingCode(): string {
  let code = '';
  for (let index = 0; index < PAIRING_CODE_LENGTH; index += 1) {
    code += PAIRING_CODE_ALPHABET[randomInt(PAIRING_CODE_ALPHABET.length)];
  }

  return code;
}

/** What a person typed: case-insensitive, `-` and spaces allowed between groups. */
export function normalizePairingCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

/** The code as shown on a console: two groups of four. */
export function displayPairingCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Only hashes are kept; a secret is never stored or compared in plain. */
export function hashSecret(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

/** Constant time over equal-length digests. */
export function digestsEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The entry whose digest matches, comparing against every entry so the time does not depend on
 * which one (or whether one) matches.
 */
export function findByDigest<T>(
  entries: Iterable<T>,
  digestOf: (entry: T) => Buffer,
  secret: string,
): T | undefined {
  const digest = hashSecret(secret);
  let found: T | undefined;
  for (const entry of entries) {
    if (digestsEqual(digestOf(entry), digest) && found === undefined) {
      found = entry;
    }
  }

  return found;
}
