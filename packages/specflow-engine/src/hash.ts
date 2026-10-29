import { createHash } from 'node:crypto';

/** Lowercase hex sha256 of a string (hashed as UTF-8) or of raw bytes. */
export function sha256Hex(data: string | Uint8Array): string {
  const hash = createHash('sha256');
  if (typeof data === 'string') {
    hash.update(data, 'utf8');
  } else {
    hash.update(data);
  }

  return hash.digest('hex');
}
