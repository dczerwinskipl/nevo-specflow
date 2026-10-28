import type { DocumentContent } from '@nevo/specflow-contracts/documents';

import type { SpecFlowEngine } from '../../application';
import { isEditable } from './content-kinds';
import { deriveDocumentTitle } from './document-title';
import { DocumentError } from '../document-rules/errors';
import { analyzeOpenFile, decodeText } from './file-analysis';
import { TEXT_CONTENT_MAX_BYTES } from './limits';
import {
  loadSpecification,
  locateDocument,
  type LoadedSpecification,
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

/** One document of an already loaded Specification. */
async function readDocumentOfLoaded(
  loaded: LoadedSpecification,
  documentId: string,
  options: ReadDocumentOptions = {},
): Promise<DocumentContent> {
  const { fs } = resolveReadOptions(options);
  const located = await locateDocument(loaded, documentId);
  const outcome = await withOpenFile(fs, loaded.specDir, located.path, async (file) => {
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
