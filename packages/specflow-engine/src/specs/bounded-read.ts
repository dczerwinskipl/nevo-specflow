import type { FileHandle } from 'node:fs/promises';

import { MANIFEST_MAX_BYTES } from './documents/limits';

/**
 * Read at most `MANIFEST_MAX_BYTES + 1` bytes of an opened manifest and decode them. A larger file is
 * never read whole: the extra byte makes the manifest parser reject it with `SPEC_SOURCE_INVALID`.
 */
export async function readManifestTextBounded(handle: FileHandle): Promise<string> {
  const buffer = Buffer.alloc(MANIFEST_MAX_BYTES + 1);
  let filled = 0;
  while (filled < buffer.length) {
    const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, filled);
    if (bytesRead === 0) break;
    filled += bytesRead;
  }
  return buffer.toString('utf8', 0, filled);
}
