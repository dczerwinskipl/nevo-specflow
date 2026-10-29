import type { BigIntStats } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';

import type { ContentKind } from '@nevo/specflow-contracts/documents';

import { readBoundedBytes } from '../bounded-read';
import { BINARY_MEDIA_TYPE, classifyContent, extensionOf, kindForExtension } from './content-kinds';
import { CONTENT_HASH_MAX_BYTES, CONTENT_SNIFF_BYTES } from './limits';
import { readAt } from '../document-rules/verified-file';
import { sha256Hex } from '../../hash';

/** What the Engine knows about one opened regular file: size, revision, kind and media type. */
export interface FileAnalysis {
  readonly size: number;
  /** sha256 of the content up to the hash limit, else `stat:<size>-<mtimeNs>` (architecture "Limits"). */
  readonly revision: string;
  readonly kind: ContentKind;
  readonly mediaType: string;
  /** The whole content, present exactly when the file is within the hash limit. */
  readonly bytes?: Buffer;
}

export function statSignatureRevision(stat: Pick<BigIntStats, 'size' | 'mtimeNs'>): string {
  return `stat:${stat.size}-${stat.mtimeNs}`;
}

/**
 * Analyse an opened file. Files within {@link CONTENT_HASH_MAX_BYTES} are read whole: the revision is
 * the hash of exactly the bytes returned, so revision and content cannot disagree. Larger files get
 * the stat signature and only their first {@link CONTENT_SNIFF_BYTES} are read, and only to decide
 * whether a text extension holds text.
 *
 * Kind rule: images by extension; text extensions are `text` when the first 8 KiB hold no NUL and are
 * valid UTF-8; and, when the whole file is available, the whole file must be valid UTF-8 so that the
 * text delivered as JSON never contains a replacement character the file did not have.
 */
export async function analyzeOpenFile(
  handle: FileHandle,
  stat: BigIntStats,
  path: string,
): Promise<FileAnalysis> {
  const extension = extensionOf(path);
  if (stat.size <= BigInt(CONTENT_HASH_MAX_BYTES)) {
    const bytes = await readBoundedBytes(handle, CONTENT_HASH_MAX_BYTES);
    if (bytes.length <= CONTENT_HASH_MAX_BYTES) {
      const classified = classifyContent(extension, bytes);
      const text = classified.kind === 'text' && isWholeUtf8(bytes);

      return {
        size: bytes.length,
        revision: sha256Hex(bytes),
        kind: text || classified.kind !== 'text' ? classified.kind : 'binary',
        mediaType: text || classified.kind !== 'text' ? classified.mediaType : BINARY_MEDIA_TYPE,
        bytes,
      };
    }
    // The file grew past the hash limit while it was being read: treat it as the larger file it is.
  }

  const head =
    kindForExtension(extension) === 'text'
      ? await readAt(handle, 0, CONTENT_SNIFF_BYTES)
      : Buffer.alloc(0);
  const classified = classifyContent(extension, head);

  return {
    size: Number(stat.size),
    revision: statSignatureRevision(stat),
    kind: classified.kind,
    mediaType: classified.mediaType,
  };
}

function isWholeUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);

    return true;
  } catch {
    return false;
  }
}

/** Decode text bytes exactly (a BOM is kept). Only call on bytes {@link analyzeOpenFile} found to be text. */
export function decodeText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
}
