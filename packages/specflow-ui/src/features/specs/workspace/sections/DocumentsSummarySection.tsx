import { Icon, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { DocumentItem } from '../model';
import { useWorkspaceRuntime } from '../WorkspaceContext';

export interface DocumentsSummarySectionProps {
  readonly documents: readonly DocumentItem[];
}

export function DocumentsSummarySection({ documents }: DocumentsSummarySectionProps) {
  const { t } = useTranslation();
  const runtime = useWorkspaceRuntime();

  return (
    <section
      aria-labelledby="documents-summary-heading"
      className="border-t border-border-subtle pt-6"
    >
      <div className="flex items-center gap-2">
        <span className="flex size-4 shrink-0 items-center justify-center text-content-muted">
          <Icon name="file" size="sm" />
        </span>
        <Typography
          as="h2"
          variant="title-sm"
          id="documents-summary-heading"
          className="font-semibold text-content-primary"
        >
          {t('specification.documentsHeading')}{' '}
          <span className="text-body-xs font-normal text-content-muted">{documents.length}</span>
        </Typography>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-4 text-body-xs">
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
        <button
          type="button"
          onClick={runtime.openDocumentsView}
          className="font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          {t('specification.allDocumentsLink')}
        </button>
      </div>
    </section>
  );
}
