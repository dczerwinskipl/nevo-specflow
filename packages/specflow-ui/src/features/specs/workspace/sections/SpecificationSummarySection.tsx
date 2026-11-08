import { Typography } from '@nevo/ui';
import { DocumentContent, DocumentDescription, markdownIntro } from '../../../documents';

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
        intro={
          intro && intro.trim() !== title.trim() ? markdownIntro(intro, title).intro : undefined
        }
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
