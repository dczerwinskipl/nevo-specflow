import { useId } from 'react';
import { Button, InformationList, MenuItem, OverflowMenu } from '@nevo/ui';
import { useDocumentsSummaryExpanded } from '../../../specs';
import { type DocumentItem } from '../../../specs/read-model';
import { OperationalRow } from '../../../../shared/operational-list';
import { WorkspaceSection } from '../../../../shared/workspace-section';
import { useTranslation } from 'react-i18next';

export interface DocumentsSummarySectionProps {
  readonly specId: string;
  readonly documents: readonly DocumentItem[];
  readonly onOpenDocument: (id: string) => void;
  readonly onOpenDocumentsView: () => void;
}

export function DocumentsSummarySection({
  specId,
  documents,
  onOpenDocument,
  onOpenDocumentsView,
}: DocumentsSummarySectionProps) {
  const { t } = useTranslation();
  const id = useId();
  // Outside the section: it survives Overview remounting it at a column change.
  const [expanded, setExpanded] = useDocumentsSummaryExpanded(specId);

  return (
    <WorkspaceSection aria-labelledby="documents-summary-heading">
      <WorkspaceSection.Header
        id="documents-summary-heading"
        title={t('specification.documentsHeading')}
        icon="file"
        count={documents.length}
        actions={
          <OverflowMenu
            triggerLabel={t('specification.documentsHeading')}
            label={t('specification.documentsHeading')}
          >
            <MenuItem onSelect={onOpenDocumentsView}>
              {t('specification.allDocumentsLink')}
            </MenuItem>
          </OverflowMenu>
        }
      />

      <InformationList id={id}>
        {(expanded ? documents : documents.slice(0, 3)).map((doc) => (
          <OperationalRow
            key={doc.id}
            primary={doc.title}
            compactFacts={[doc.kind]}
            supporting={doc.summary}
            onPrimaryClick={() => onOpenDocument(doc.id)}
            // A stable identity, so focus finds the row again when Overview remounts it.
            dataAttributes={{ 'data-focus-key': `document:${doc.id}` }}
          />
        ))}
      </InformationList>
      {documents.length > 3 ? (
        <WorkspaceSection.Footer>
          <Button
            variant="secondary"
            size="sm"
            aria-expanded={expanded}
            aria-controls={id}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded
              ? t('taskDetails.showLess')
              : t('taskDetails.showAll', { count: documents.length })}
          </Button>
        </WorkspaceSection.Footer>
      ) : null}
    </WorkspaceSection>
  );
}
