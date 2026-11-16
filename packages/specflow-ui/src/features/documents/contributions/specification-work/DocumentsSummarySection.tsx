import { useId } from 'react';
import { Button, EmptyState, MenuItem, OverflowMenu, TooltipProvider } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { useDocumentsSummaryExpanded } from '../../../specs';
import { type DocumentItem } from '../../../specs/read-model';
import { TreeDocumentRow, TreeLevel } from '../../../../shared/document-tree';
import { WorkspaceSection } from '../../../../shared/workspace-section';
import { declaredTypeIcon, documentRowGlyph, typeTitle } from '../../catalogue/documentTypePolicy';
import { useDocumentCatalogue } from '../../catalogue/useDocumentCatalogue';

/** Documents the section lists before "Show all" (the accepted Overview: a whole archetype set). */
const OVERVIEW_DOCUMENTS = 8;

export interface DocumentsSummarySectionProps {
  readonly specId: string;
  readonly documents: readonly DocumentItem[];
  readonly onOpenDocument: (id: string) => void;
  readonly onOpenDocumentsView: () => void;
}

/**
 * The Overview's Documents: the Documents page's own row (type glyph and file name, one line each,
 * the type in the tooltip and read with the name) in a flat list, and a quiet "Template only" for a
 * document that is still only its archetype template. Without documents the section keeps its
 * place with an inline empty state.
 */
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
  const catalogue = useDocumentCatalogue();
  const shown = expanded ? documents : documents.slice(0, OVERVIEW_DOCUMENTS);

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
      {documents.length === 0 ? (
        <EmptyState variant="inline" title={t('specification.documentsEmptyTitle')} />
      ) : (
        // The rows' tooltips (type) delay like the Documents page's tree.
        <TooltipProvider delayDuration={300}>
          <div id={id}>
            <TreeLevel top flat labelledBy="documents-summary-heading">
              {shown.map((doc) => {
                // The type's catalogue title; the type id while the catalogue loads or is unreadable.
                const type = typeTitle(catalogue.data, doc.kind);

                return (
                  <TreeDocumentRow
                    key={doc.id}
                    name={doc.filename ?? doc.title}
                    glyph={documentRowGlyph({}, declaredTypeIcon(catalogue.data, doc.kind))}
                    state={
                      doc.templateOnly
                        ? { text: t('specification.documentTemplateOnly') }
                        : undefined
                    }
                    details={[t('documents.tree.typeOf', { type })]}
                    spokenDetail={type}
                    current={false}
                    onOpen={() => onOpenDocument(doc.id)}
                    // A stable identity, so focus finds the row again when Overview remounts it.
                    focusKey={`document:${doc.id}`}
                  />
                );
              })}
            </TreeLevel>
          </div>
        </TooltipProvider>
      )}
      {documents.length > OVERVIEW_DOCUMENTS ? (
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
