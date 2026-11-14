import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Separator, Skeleton, Typography } from '@nevo/ui';
import type { WorkspaceDocsRelatedDocument } from '@nevo/specflow-contracts/docs';
import { useDocsArticle } from '../read-model';
import { SkippedDocumentList } from '../skipped/SkippedDocumentList';
import { useArticleNavigation } from './articleContext';
import { DocumentLink, ReferencePopover } from './referenceViews';

/** The error of a skipped document, read from its refusal when the popover opens. */
function SkippedError({
  workspaceId,
  documentId,
  docsRoot,
}: {
  workspaceId: string;
  documentId: string;
  docsRoot: string;
}) {
  const { t } = useTranslation();
  const result = useDocsArticle(workspaceId, documentId);
  if (!result.data && !result.isError) {
    return <Skeleton className="h-4 w-48" />;
  }

  const skipped = result.data?.kind === 'skipped' ? result.data.refusal.skipped : [];
  if (skipped.length === 0) {
    return (
      <Typography as="p" variant="body-sm" className="text-content-secondary">
        {t('docs.related.skippedUnknown')}
      </Typography>
    );
  }

  return <SkippedDocumentList skipped={skipped} docsRoot={docsRoot} />;
}

function RelatedItem({ item, docsRoot }: { item: WorkspaceDocsRelatedDocument; docsRoot: string }) {
  const { t } = useTranslation();
  const navigation = useArticleNavigation();
  switch (item.state) {
    case 'active':
      return (
        <DocumentLink workspaceId={navigation.workspaceId} documentId={item.documentId}>
          {item.title ?? item.documentId}
        </DocumentLink>
      );
    case 'inactive':
      return (
        <span className="text-content-muted">
          {t('docs.related.inactive', { title: item.title ?? item.documentId })}
        </span>
      );
    case 'missing':
      return (
        <span className="text-content-muted">
          {t('docs.related.missing', { id: item.documentId })}
        </span>
      );
    case 'skipped':
      return (
        <ReferencePopover
          trigger={t('docs.related.skipped', { id: item.documentId })}
          title={t('docs.reference.linkNotOpened')}
        >
          <SkippedError
            workspaceId={navigation.workspaceId}
            documentId={item.documentId}
            docsRoot={docsRoot}
          />
        </ReferencePopover>
      );
  }
}

/** The documents the article relates to (frontmatter `related`), at the end of the article. */
export function RelatedDocuments({
  related,
  docsRoot,
}: {
  related: readonly WorkspaceDocsRelatedDocument[];
  /** The workspace's `docs.root`: a skipped document is named by its repository path. */
  docsRoot: string;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  if (related.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby={headingId} className="mt-8 grid gap-2">
      <Separator />
      <Typography
        as="h2"
        id={headingId}
        variant="section-label"
        className="pt-2 text-content-muted"
      >
        {t('docs.related.heading')}
      </Typography>
      <ul className="m-0 grid list-none gap-1 p-0">
        {related.map((item) => (
          <li key={item.documentId} className="text-body-md">
            <RelatedItem item={item} docsRoot={docsRoot} />
          </li>
        ))}
      </ul>
    </section>
  );
}
