import {
  DocumentError,
  readRegisteredDocumentSummaries,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';

import { documentFailure } from './error-status';

/** The shape of the Specification workspace `documents` section (the Specs feature consumes it). */
export type WorkspaceDocumentsSource = (specId: string) => Promise<
  | {
      readonly state: 'available';
      readonly data: {
        readonly items: {
          readonly id: string;
          readonly title: string;
          readonly filename: string;
          readonly revision: string;
          readonly kind: string;
        }[];
      };
    }
  | { readonly state: 'unavailable'; readonly reason: 'source_unavailable' }
>;

/**
 * The `documents` section of the Specification workspace in project mode: the registered documents
 * whose file exists (unclassified and dangling entries are not part of this section; the document
 * tree shows them). `kind` is the document type id. A Specification whose manifest or directory
 * cannot be read degrades to the section's unavailable state, like every other source failure.
 */
export function createEngineWorkspaceDocuments(engine: SpecFlowEngine): WorkspaceDocumentsSource {
  return async (specId) => {
    try {
      const summaries = await readRegisteredDocumentSummaries(engine, specId);

      return {
        state: 'available',
        data: {
          items: summaries.map((summary) => ({
            id: summary.id,
            title: summary.title,
            filename: summary.path,
            revision: summary.revision,
            kind: summary.type,
          })),
        },
      };
    } catch (error) {
      if (error instanceof DocumentError || documentFailure(error) !== undefined) {
        return { state: 'unavailable', reason: 'source_unavailable' };
      }

      throw error;
    }
  };
}
