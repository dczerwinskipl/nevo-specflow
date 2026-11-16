import { Typography } from '@nevo/ui';
import { DocumentContent, DocumentDescription } from '../../../documents';

export interface SpecificationSummarySectionProps {
  readonly title: string;
  readonly intro?: string;
  readonly overviewDocumentId?: string;
  readonly specId?: string;
}

/** The title and, whenever they exist, the description and the main document preview. */
export function SpecificationSummarySection({
  title,
  intro,
  overviewDocumentId,
  specId,
}: SpecificationSummarySectionProps) {
  const description = intro && intro.trim() !== title.trim() ? intro.trim() : undefined;
  // "Show more" continues a description the Runtime cut (it ends the cut text with `…`), or shows
  // the overview when there is no description; a whole one-paragraph description has nothing more.
  const clamped = description === undefined || description.endsWith('…');

  return (
    <div>
      <Typography
        as="h1"
        tabIndex={-1}
        data-page-title
        variant="title-lg"
        className="font-semibold text-content-primary outline-none [overflow-wrap:anywhere]"
      >
        {title}
      </Typography>
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
