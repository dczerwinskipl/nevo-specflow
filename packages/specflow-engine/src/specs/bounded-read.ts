import type { FileHandle } from 'node:fs/promises';

import { MANIFEST_MAX_BYTES } from './documents';

/**
 * Read at most `limit + 1` bytes from the start of an opened file. A file larger than `limit` is never
 * read whole: the extra byte tells the caller it is too large.
 */
export async function readBoundedBytes(handle: FileHandle, limit: number): Promise<Buffer> {
  const buffer = Buffer.alloc(limit + 1);
  let filled = 0;
  while (filled < buffer.length) {
    const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, filled);
    if (bytesRead === 0) {
      break;
    }

    filled += bytesRead;
  }

  return buffer.subarray(0, filled);
}

/**
 * Read at most `MANIFEST_MAX_BYTES + 1` bytes of an opened manifest and decode them. A larger file is
 * never read whole: the extra byte makes the manifest parser reject it with `SPEC_SOURCE_INVALID`.
 */
export async function readManifestTextBounded(handle: FileHandle): Promise<string> {
  return (await readBoundedBytes(handle, MANIFEST_MAX_BYTES)).toString('utf8');
}
