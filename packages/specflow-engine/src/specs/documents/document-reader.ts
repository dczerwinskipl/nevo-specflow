import type { DocumentContent } from '@nevo/specflow-contracts/documents';

import type { SpecFlowEngine } from '../../application';
import { isEditable } from './content-kinds';
import { deriveDocumentTitle } from './document-title';
import { DocumentError } from '../document-rules/errors';
import { analyzeOpenFile, decodeText } from './file-analysis';
import { TEXT_CONTENT_MAX_BYTES } from './limits';
import {
  loadDocumentContainer,
  loadSpecification,
  locateDocument,
  type DocumentContainerRef,
  type LoadedDocumentContainer,
} from './loaded-specification';
import { resolveReadOptions, type DocumentReadOptions } from './read-options';
import { withOpenFile } from '../document-rules/verified-file';

export interface ReadDocumentOptions extends DocumentReadOptions {
  /** `?revision=`: anything but the current revision is `DOCUMENT_REVISION_UNAVAILABLE`. */
  readonly revision?: string;
}

/** One document as JSON (`GET .../documents/:documentId`). */
export async function readSpecificationDocument(
  engine: SpecFlowEngine,
  specId: string,
  documentId: string,
  options: ReadDocumentOptions = {},
): Promise<DocumentContent> {
  const loaded = await loadSpecification(engine, specId, resolveReadOptions(options).fs);

  return readDocumentOfLoaded(loaded, documentId, options);
}

/** One document of a Task of the Specification, as JSON. */
export async function readTaskDocument(
  engine: SpecFlowEngine,
  specId: string,
  taskId: string,
  documentId: string,
  options: ReadDocumentOptions = {},
): Promise<DocumentContent> {
  const loaded = await loadDocumentContainer(
    engine,
    { kind: 'task', specId, taskId },
    resolveReadOptions(options).fs,
  );

  return readDocumentOfLoaded(loaded, documentId, options);
}

/** One registered document of a type, as a workflow gate reads it. */
export interface TypedDocumentReading {
  readonly id: string;
  /** Whether the registered document has a file. */
  readonly present: boolean;
  /** The text of a text file within the JSON read limit; absent otherwise. */
  readonly text?: string;
  /**
   * The file exists but could not be read (it is redirected, not a regular file, or the read
   * failed): a gate never counts it as satisfying, so it fails closed.
   */
  readonly unreadable?: true;
}

/**
 * The documents of a type the Specification or one of its Tasks registers, in registry order, with
 * each file's text (the workflow gates, `workflow/gates`). Read-only, no lock, no Git; a registered
 * document without a file is `present: false`, a binary or oversized one has no `text`, and one whose
 * file cannot be read is `unreadable` (one such document never fails the whole read). Only the
 * container itself failing to load (unknown, unavailable) is an error.
 */
export async function readRegisteredDocumentsOfType(
  engine: SpecFlowEngine,
  ref: DocumentContainerRef,
  documentType: string,
  options: DocumentReadOptions = {},
): Promise<TypedDocumentReading[]> {
  const { fs } = resolveReadOptions(options);
  const loaded = await loadDocumentContainer(engine, ref, fs);
  const readings: TypedDocumentReading[] = [];
  for (const entry of loaded.manifest.documents) {
    if (entry.type !== documentType) {
      continue;
    }

    try {
      const outcome = await withOpenFile(fs, loaded.rootDir, entry.path, async (file) => {
        const analysis = await analyzeOpenFile(file.handle, file.stat, entry.path);

        return analysis.kind === 'text' && analysis.size <= TEXT_CONTENT_MAX_BYTES && analysis.bytes
          ? decodeText(analysis.bytes)
          : undefined;
      });
      if (outcome.state === 'opened') {
        const text = outcome.value;
        readings.push({ id: entry.id, present: true, ...(text !== undefined ? { text } : {}) });
      } else if (outcome.state === 'not-regular') {
        readings.push({ id: entry.id, present: true, unreadable: true });
      } else {
        readings.push({ id: entry.id, present: false });
      }
    } catch (error) {
      // A redirected path or a failed read of this one file: the gate fails closed on it.
      if (error instanceof DocumentError || isFileSystemError(error)) {
        readings.push({ id: entry.id, present: true, unreadable: true });
      } else {
        throw error;
      }
    }
  }

  return readings;
}

/** A failed file-system call (`EACCES`, `EISDIR`, ...), not a defect of the program. */
function isFileSystemError(error: unknown): boolean {
  return (
    error instanceof Error &&
    typeof (error as NodeJS.ErrnoException).code === 'string' &&
    typeof (error as NodeJS.ErrnoException).syscall === 'string'
  );
}

/** One document of an already loaded container. */
async function readDocumentOfLoaded(
  loaded: LoadedDocumentContainer,
  documentId: string,
  options: ReadDocumentOptions = {},
): Promise<DocumentContent> {
  const { fs } = resolveReadOptions(options);
  const located = await locateDocument(loaded, documentId);
  const outcome = await withOpenFile(fs, loaded.rootDir, located.path, async (file) => {
    const analysis = await analyzeOpenFile(file.handle, file.stat, located.path);
    if (options.revision !== undefined && options.revision !== analysis.revision) {
      throw new DocumentError(
        'DOCUMENT_REVISION_UNAVAILABLE',
        'The requested revision is not the current one.',
      );
    }

    if (analysis.kind === 'text' && analysis.size > TEXT_CONTENT_MAX_BYTES) {
      throw new DocumentError(
        'DOCUMENT_TOO_LARGE',
        'The document is too large to read as JSON; use the raw endpoint.',
      );
    }

    const content =
      analysis.kind === 'text' && analysis.bytes ? decodeText(analysis.bytes) : undefined;

    return {
      id: located.id,
      path: located.path,
      title: deriveDocumentTitle(located.path, content),
      classification: located.classification,
      ...(located.type !== undefined ? { type: located.type } : {}),
      kind: analysis.kind,
      mediaType: analysis.mediaType,
      size: analysis.size,
      revision: analysis.revision,
      editable:
        loaded.location === 'active' &&
        isEditable({ path: located.path, kind: analysis.kind, size: analysis.size }),
      ...(content !== undefined ? { content } : {}),
    } satisfies DocumentContent;
  });
  if (outcome.state !== 'opened') {
    throw new DocumentError('DOCUMENT_FILE_MISSING', 'The document has no file.');
  }

  return outcome.value;
}
