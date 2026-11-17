import { Readable } from 'node:stream';
import { DocumentError, type OpenedDocument } from '@nevo/specflow-engine';
import type { DemoCatalogue } from '../../demo-catalogue';
import type { DocumentReadSource } from '../content/document-read-source';
import { baseName } from './model';
import { demoContent, demoTree, locate, observe } from './projection';
import type { DemoDocuments } from './operations';

const notFound = () => new DocumentError('DOCUMENT_NOT_FOUND', 'Unknown document.');

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
      const content = demoContent(await directory(specId), await file(specId, documentId));
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
