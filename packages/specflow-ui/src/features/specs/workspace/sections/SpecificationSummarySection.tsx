import { Icon, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { DocumentContent, DocumentDescription } from '../../../documents';
import { productIcons } from '../../../../shared/product-icons';

export interface SpecificationSummarySectionProps {
  readonly title: string;
  /** The Specification's key (`nevo-2`); without one the line under the title names only the type. */
  readonly specificationKey?: string;
  readonly intro?: string;
  readonly overviewDocumentId?: string;
  readonly specId?: string;
  /** The overview holds only its initial content (a template): there is nothing to show yet. */
  readonly overviewInitialOnly?: boolean;
}

/**
 * The title, the line that says what the page is (the Specification icon, "Specification" and its
 * key) and, whenever they exist, the description and the main document preview.
 */
export function SpecificationSummarySection({
  title,
  specificationKey,
  intro,
  overviewDocumentId,
  specId,
  overviewInitialOnly = false,
}: SpecificationSummarySectionProps) {
  const { t } = useTranslation();
  const description = intro && intro.trim() !== title.trim() ? intro.trim() : undefined;
  // "Show more" continues a description the Runtime cut (it ends the cut text with `…`), or shows
  // the overview when there is no description; a whole one-paragraph description has nothing more.
  // Without a description an overview that is still its initial content (the template's headings)
  // is no description either: no "Show description" for it.
  const clamped = description === undefined ? !overviewInitialOnly : description.endsWith('…');

  return (
    <div>
      <div className="grid gap-1">
        <Typography
          as="h1"
          tabIndex={-1}
          data-page-title
          variant="title-lg"
          className="font-semibold text-content-primary outline-none [overflow-wrap:anywhere]"
        >
          {title}
        </Typography>
        <Typography
          variant="body-sm"
          className="flex min-w-0 items-center gap-1.5 text-content-muted"
          data-page-kind=""
        >
          <Icon
            name={productIcons.specification.item}
            size="sm"
            className="text-content-secondary"
          />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            <span className="font-medium text-content-secondary">{t('specification.title')}</span>
            {specificationKey ? ` · ${specificationKey}` : null}
          </span>
        </Typography>
      </div>
      <DocumentDescription
        key={`${specId}:${overviewDocumentId}`}
        // `summary` is already plain text bounded by the Runtime (320 graphemes): shown as is,
        // never parsed as Markdown again. A summary equal to the title adds nothing.
        intro={description}
        hasMore={Boolean(overviewDocumentId && specId) && clamped}
        renderDocument={
          overviewDocumentId && specId
            ? () => (
                <DocumentContent
                  specId={specId}
                  documentId={overviewDocumentId}
                  omitTitle={title}
                />
              )
            : undefined
        }
      />
    </div>
  );
}
