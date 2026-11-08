import { Typography } from '@nevo/ui';
import { DocumentContent, DocumentDescription } from '../../../documents';

export interface SpecificationSummarySectionProps {
  readonly title: string;
  readonly intro?: string;
  readonly mainDocumentId?: string;
  readonly specId?: string;
}

/** The title and, whenever they exist, the description and the main document preview. */
export function SpecificationSummarySection({
  title,
  intro,
  mainDocumentId,
  specId,
}: SpecificationSummarySectionProps) {
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
        key={`${specId}:${mainDocumentId}`}
        // `summary` is already plain text bounded by the Runtime (320 graphemes): shown as is,
        // never parsed as Markdown again. A summary equal to the title adds nothing.
        intro={intro && intro.trim() !== title.trim() ? intro.trim() : undefined}
        hasMore={Boolean(mainDocumentId && specId)}
        renderDocument={
          mainDocumentId && specId
            ? () => (
                <DocumentContent specId={specId} documentId={mainDocumentId} omitTitle={title} />
              )
            : undefined
        }
      />
    </div>
  );
}
