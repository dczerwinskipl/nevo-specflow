import { Readable } from 'node:stream';
import type { DocumentContent } from '@nevo/specflow-contracts/documents';
import { DocumentError, type OpenedDocument } from '@nevo/specflow-engine';
import type { DemoCatalogue, DemoSpecification } from '../../demo-catalogue';
import type { DocumentReadSource } from '../content/document-read-source';
import { baseName } from './model';
import { demoContent, demoTree, locate, observe } from './projection';
import type { DemoDocuments } from './operations';
import { SEED_OVERVIEW_REVISION } from './seed';

const notFound = () => new DocumentError('DOCUMENT_NOT_FOUND', 'Unknown document.');

/**
 * Demo-only: the Task documents (`TASK-<n>`) of a seeded Specification are readable by id, as Task
 * pages expect, but are not files of its document tree. Their text is generated and never changes,
 * and the demo Task pages read them at the fixed seed revision (`tasks/demo/sources.ts`), so every
 * Task document reports that one revision. A revision identifies a version of one document, never
 * content across documents; a real Runtime derives it from the bytes.
 */
function taskDocument(record: DemoSpecification, documentId: string): DocumentContent | undefined {
  const number = /^TASK-(\d+)$/u.exec(documentId);
  if (!number || Number(number[1]) < 1 || Number(number[1]) > record.progress.total) {
    return;
  }

  const title = documentId + ' · ' + record.title;
  const content =
    '# ' +
    title +
    '\n\nDemonstration Task for ' +
    record.title +
    '\n\n## Acceptance criteria\n\n- Verify navigation and session behaviour.\n- Preserve user context.';

  return {
    id: documentId,
    path: 'tasks/' + documentId + '.md',
    title,
    classification: 'unclassified',
    kind: 'text',
    mediaType: 'text/markdown; charset=utf-8',
    size: Buffer.byteLength(content, 'utf8'),
    revision: SEED_OVERVIEW_REVISION,
    editable: false,
    content,
  };
}

/**
 * The read port of the real document routes (`document-tree`, `documents/:documentId`, `raw`) served
 * from the demo directories: the demo Runtime answers the real read contract, errors included.
 */
export function createDemoDocumentReadSource(
  documents: Pick<DemoDocuments, 'directory'>,
  catalogue: DemoCatalogue,
): DocumentReadSource {
  const find = (specId: string) => catalogue.find(specId);
  const directory = async (specId: string) => {
    const found = await documents.directory(specId, find);
    if (!found) {
      throw notFound();
    }

    return found;
  };

  const file = async (specId: string, documentId: string) => {
    const located = locate(await directory(specId), documentId);
    if (!located) {
      throw notFound();
    }

    if (located.kind === 'dangling') {
      throw new DocumentError('DOCUMENT_FILE_MISSING', 'The registered document has no file.');
    }

    return located;
  };

  return {
    readTree: async (specId) => demoTree(await directory(specId)),
    async read(specId, documentId, revision) {
      const spec = await directory(specId);
      const record = await find(specId);
      const task =
        record && locate(spec, documentId) === undefined
          ? taskDocument(record, documentId)
          : undefined;
      const content = task ?? demoContent(spec, await file(specId, documentId));
      if (revision !== undefined && revision !== content.revision) {
        throw new DocumentError(
          'DOCUMENT_REVISION_UNAVAILABLE',
          'Only the current revision can be read.',
        );
      }

      return content;
    },
    async open(specId, documentId): Promise<OpenedDocument> {
      const located = await file(specId, documentId);
      const observed = observe(located.path, located.file);

      return {
        metadata: {
          specId,
          id: located.id,
          path: located.path,
          filename: baseName(located.path),
          classification: located.entry ? 'registered' : 'unclassified',
          ...(located.entry ? { type: located.entry.type } : {}),
          kind: observed.kind,
          mediaType: observed.mediaType,
          size: observed.size,
          revision: observed.revision,
        },
        stream: Readable.from([Buffer.from(located.file.bytes)]),
      };
    },
  };
}
