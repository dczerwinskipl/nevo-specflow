import { DocumentError } from '@nevo/specflow-engine';

import type { DemoCatalogue } from '../../demo-catalogue';
import type { DocumentContentSource } from '../content/read-document';
import { demoDocumentContent } from './content';

export function createDemoDocumentSource(catalogue: DemoCatalogue): DocumentContentSource {
  return {
    async read(specId, documentId, revision) {
      const record = await catalogue.find(specId);
      if (!record) throw new DocumentError('DOCUMENT_NOT_FOUND', 'The document does not exist.');
      const taskNumber = /^TASK-(\d+)$/.exec(documentId);
      const task =
        taskNumber && Number(taskNumber[1]) >= 1 && Number(taskNumber[1]) <= record.progress.total;
      if (!task && documentId !== 'spec') {
        throw new DocumentError('DOCUMENT_NOT_FOUND', 'The document does not exist.');
      }
      if (revision !== undefined && revision !== 'demo-document-1') {
        throw new DocumentError(
          'DOCUMENT_REVISION_UNAVAILABLE',
          'The requested revision is not the current one.',
        );
      }
      const title = task ? documentId + ' · ' + record.title : 'Specification';
      const content = task
        ? '# ' +
          title +
          '\n\nDemonstration Task for ' +
          record.title +
          '\n\n## Acceptance criteria\n\n- Verify navigation and session behaviour.\n- Preserve user context.'
        : '# ' + record.title + '\n\nDemonstration Specification for ' + record.id + '.';
      return demoDocumentContent({ id: documentId, title, content, revision: 'demo-document-1' });
    },
  };
}
