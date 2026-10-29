import { createHash } from 'node:crypto';

import { DOCUMENT_ID_PATTERN } from '@nevo/specflow-contracts/documents';
import { sha256Hex } from '../../hash';

/**
 * Document ids (architecture "Identity, paths and the registry"). Registered ids are allocated
 * deterministically; unclassified files get a derived `u-` id. Pure.
 */

/** Prefix reserved for the derived ids of unclassified files; no registered id may start with it. */
export const DERIVED_ID_PREFIX = 'u-';
const REGISTERED_ID = new RegExp(DOCUMENT_ID_PATTERN, 'u');
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const SUFFIX_START_LENGTH = 6;

export class DocumentIdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentIdError';
  }
}

/** A well-formed registered id: pattern ok and not in the reserved `u-` space. */
export function isRegisteredDocumentId(id: string): boolean {
  return REGISTERED_ID.test(id) && !id.startsWith(DERIVED_ID_PREFIX);
}

export function isDerivedDocumentId(id: string): boolean {
  return id.startsWith(DERIVED_ID_PREFIX);
}

/** `u-` plus the first 32 hex characters (128 bits) of sha256 of the exact path (case preserved). */
export function deriveUnclassifiedDocumentId(path: string): string {
  return DERIVED_ID_PREFIX + sha256Hex(path).slice(0, 32);
}

/** Lowercase RFC 4648 base32 (no padding) of the bytes. */
export function base32Lower(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }

    value &= (1 << bits) - 1;
  }

  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return out;
}

export interface AllocateDocumentIdInput {
  readonly specId: string;
  /** Document type id. */
  readonly type: string;
  /** Index of the entry in the registry at allocation. */
  readonly position: number;
  /** Every id that must not be reused (registry ids, plus ids allocated earlier in the same batch). */
  readonly existingIds: Iterable<string>;
}

/**
 * First document of a type gets `<type>`; later ones `<type>-<suffix>` where `suffix` is the first 6
 * characters of base32(sha256(`<specId>:<position>`)), extended one character at a time on collision.
 * Throws {@link DocumentIdError} when the type could only produce an id in the reserved `u-` space.
 */
export function allocateDocumentId(input: AllocateDocumentIdInput): string {
  const taken = new Set(input.existingIds);
  if (input.type === 'u' || input.type.startsWith(DERIVED_ID_PREFIX)) {
    // `u` and `u-*` types are refused up front (the catalogue rejects them too), so the first and
    // every later document of such a type behave the same.
    throw new DocumentIdError(
      `Document type "${input.type}" cannot produce a registered document id.`,
    );
  }

  if (isRegisteredDocumentId(input.type) && !taken.has(input.type)) {
    return input.type;
  }

  const digest = createHash('sha256').update(`${input.specId}:${input.position}`, 'utf8').digest();
  const encoded = base32Lower(digest);
  for (let length = SUFFIX_START_LENGTH; length <= encoded.length; length += 1) {
    const candidate = `${input.type}-${encoded.slice(0, length)}`;
    if (!isRegisteredDocumentId(candidate)) {
      throw new DocumentIdError(
        `Document type "${input.type}" cannot produce a registered document id.`,
      );
    }

    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  throw new DocumentIdError('Document id suffix space is exhausted.');
}
