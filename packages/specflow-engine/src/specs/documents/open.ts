import { Readable } from 'node:stream';
import type { FileHandle } from 'node:fs/promises';

import type { Classification, ContentKind } from '@nevo/specflow-contracts/documents';

import type { SpecFlowEngine } from '../../application';
import { analyzeOpenFile } from './file-analysis';
import { DocumentError } from './errors';
import { RAW_CONTENT_MAX_BYTES } from './limits';
import {
  loadSpecification,
  locateDocument,
  type DocumentReadOptions,
  type LoadedSpecification,
} from './read';
import { nodeVerifiedFs, openVerifiedFile } from './verified-file';

/** Everything the raw endpoint needs to describe the bytes it is about to stream. */
export interface OpenedDocumentMetadata {
  readonly specId: string;
  readonly id: string;
  readonly path: string;
  /** Last path segment, for `Content-Disposition`. The transport must encode it. */
  readonly filename: string;
  readonly classification: Classification;
  readonly type?: string;
  readonly kind: ContentKind;
  /** Media type from the Engine's closed table. Text kinds are never `text/html`. */
  readonly mediaType: string;
  readonly size: number;
  readonly revision: string;
}

export interface OpenedDocument {
  readonly metadata: OpenedDocumentMetadata;
  /**
   * Exactly `metadata.size` bytes. Closing or destroying the stream releases the file; a file that
   * becomes shorter while it is streamed fails the stream (the response is aborted, never padded).
   */
  readonly stream: Readable;
}

const CHUNK_BYTES = 64 * 1024;

/**
 * Open a document for raw streaming (`GET .../raw`). The physical path is verified before and after
 * the open (see `verified-file.ts`): a symlinked entry is never opened and a swap between the check
 * and the open is detected. Registered and unclassified files are openable, a dangling entry is
 * `DOCUMENT_FILE_MISSING`, a file above the raw limit is `DOCUMENT_TOO_LARGE`, and a path that leaves
 * the Specification directory is `SPEC_SOURCE_UNAVAILABLE`. Takes no lock and starts no process.
 */
export async function openSpecificationDocument(
  engine: SpecFlowEngine,
  specId: string,
  documentId: string,
  options: DocumentReadOptions = {},
): Promise<OpenedDocument> {
  const loaded = await loadSpecification(engine, specId, options.fs ?? nodeVerifiedFs);
  return openDocumentOfLoaded(loaded, documentId, options);
}

/** {@link openSpecificationDocument} for an already loaded Specification. */
export async function openDocumentOfLoaded(
  loaded: LoadedSpecification,
  documentId: string,
  options: DocumentReadOptions = {},
): Promise<OpenedDocument> {
  const fs = options.fs ?? nodeVerifiedFs;
  const located = await locateDocument(loaded, documentId);
  const opened = await openVerifiedFile(fs, loaded.specDir, located.path);
  if (opened.state !== 'opened') {
    throw new DocumentError('DOCUMENT_FILE_MISSING', 'The document has no file.');
  }
  const { handle, stat } = opened;
  let handedOver = false;
  try {
    if (stat.size > BigInt(RAW_CONTENT_MAX_BYTES)) {
      throw new DocumentError('DOCUMENT_TOO_LARGE', 'The document is larger than the raw limit.');
    }
    const analysis = await analyzeOpenFile(handle, stat, located.path);
    const metadata: OpenedDocumentMetadata = {
      specId: loaded.specId,
      id: located.id,
      path: located.path,
      filename: located.path.slice(located.path.lastIndexOf('/') + 1),
      classification: located.classification,
      ...(located.type !== undefined ? { type: located.type } : {}),
      kind: analysis.kind,
      mediaType: analysis.mediaType,
      size: analysis.size,
      revision: analysis.revision,
    };
    if (analysis.bytes) {
      // Within the hash limit the bytes are already in memory and match the revision exactly.
      return { metadata, stream: Readable.from([analysis.bytes], { objectMode: false }) };
    }
    // Large file: the revision is a stat signature, so the file must still be the one that was
    // stat'ed. A change in the window is reported instead of served under a stale ETag.
    const current = await handle.stat({ bigint: true });
    if (current.size !== stat.size || current.mtimeNs !== stat.mtimeNs) {
      throw new DocumentError(
        'SPEC_SOURCE_UNAVAILABLE',
        'A document changed while it was being opened.',
      );
    }
    handedOver = true;
    return { metadata, stream: new FileStream(handle, analysis.size) };
  } finally {
    if (!handedOver) await handle.close().catch(() => undefined);
  }
}

/** Streams exactly `size` bytes of an open handle, then closes it; closes it on destroy as well. */
class FileStream extends Readable {
  private position = 0;
  private handleClosed = false;

  constructor(
    private readonly handle: FileHandle,
    private readonly size: number,
  ) {
    super();
  }

  override _read(): void {
    if (this.position >= this.size) {
      this.push(null);
      return;
    }
    const length = Math.min(CHUNK_BYTES, this.size - this.position);
    const buffer = Buffer.allocUnsafe(length);
    this.handle.read(buffer, 0, length, this.position).then(
      ({ bytesRead }) => {
        if (bytesRead === 0) {
          this.destroy(new Error('The document became shorter while it was being sent.'));
          return;
        }
        this.position += bytesRead;
        this.push(buffer.subarray(0, bytesRead));
      },
      (error: unknown) => this.destroy(error instanceof Error ? error : new Error('Read failed.')),
    );
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    if (this.handleClosed) {
      callback(error);
      return;
    }
    this.handleClosed = true;
    this.handle.close().then(
      () => callback(error),
      () => callback(error),
    );
  }
}
