import { useTranslation } from 'react-i18next';
import type { DocumentItem } from '../model';
import { useWorkspaceRuntime } from '../WorkspaceContext';
import { WorkspaceSection } from './WorkspaceSection';

export interface DocumentsSummarySectionProps {
  readonly documents: readonly DocumentItem[];
}

export function DocumentsSummarySection({ documents }: DocumentsSummarySectionProps) {
  const { t } = useTranslation();
  const runtime = useWorkspaceRuntime();

  return (
    <WorkspaceSection aria-labelledby="documents-summary-heading">
      <WorkspaceSection.Header
        id="documents-summary-heading"
        title={t('specification.documentsHeading')}
        icon="file"
        count={documents.length}
      />

      <div className="flex flex-wrap items-center gap-4 text-body-xs">
        {documents.slice(1, 3).map((doc) => (
          <button
            key={doc.id}
            type="button"
            onClick={() => runtime.openDoc(doc.id)}
            className="font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
          >
            {doc.title}
          </button>
        ))}
      </div>

      <WorkspaceSection.Footer>
        <WorkspaceSection.Continuation onClick={runtime.openDocumentsView}>
          {t('specification.allDocumentsLink')}
        </WorkspaceSection.Continuation>
      </WorkspaceSection.Footer>
    </WorkspaceSection>
  );
}
