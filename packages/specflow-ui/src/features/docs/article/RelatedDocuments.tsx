import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Link,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Skeleton,
  Typography,
} from '@nevo/ui';
import type { WorkspaceDocsRelatedDocument } from '@nevo/specflow-contracts/docs';
import { useDocsArticle } from '../read-model';
import { docsHref } from '../reader/readerLocation';
import { useArticleNavigation } from './articleContext';

/** The error of a skipped document, read from its refusal when the popover opens. */
function SkippedError({ workspaceId, documentId }: { workspaceId: string; documentId: string }) {
  const { t } = useTranslation();
  const result = useDocsArticle(workspaceId, documentId);
  if (!result.data) {
    return result.isError ? (
      <Typography as="p" variant="body-sm" className="text-content-secondary">
        {t('docs.related.skippedUnknown')}
      </Typography>
    ) : (
      <Skeleton className="h-4 w-48" />
    );
  }

  const skipped = result.data.kind === 'skipped' ? result.data.refusal.skipped : [];

  return (
    <ul className="m-0 grid list-none gap-1.5 p-0">
      {skipped.length === 0 ? (
        <li>
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            {t('docs.related.skippedUnknown')}
          </Typography>
        </li>
      ) : (
        skipped.map((item) => (
          <li key={item.path} className="grid gap-0.5">
            <Typography as="code" variant="code-md" className="break-all text-content-muted">
              {item.path}
            </Typography>
            <Typography as="span" variant="body-sm" className="text-content-secondary">
              {item.error}
            </Typography>
          </li>
        ))
      )}
    </ul>
  );
}

function RelatedItem({ item }: { item: WorkspaceDocsRelatedDocument }) {
  const { t } = useTranslation();
  const navigation = useArticleNavigation();
  switch (item.state) {
    case 'active':
      return (
        <Link
          href={docsHref(navigation.workspaceId, item.documentId)}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
              return;
            }

            event.preventDefault();
            navigation.openDocument(item.documentId);
          }}
        >
          {item.title ?? item.documentId}
        </Link>
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
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline cursor-pointer text-left text-content-secondary underline decoration-dotted underline-offset-4"
            >
              {t('docs.related.skipped', { id: item.documentId })}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="grid w-[min(20rem,calc(100vw-2rem))] gap-2 p-3">
            <Typography as="p" variant="label-md">
              {t('docs.reference.linkNotOpened')}
            </Typography>
            <SkippedError workspaceId={navigation.workspaceId} documentId={item.documentId} />
          </PopoverContent>
        </Popover>
      );
  }
}

/** The documents the article relates to (frontmatter `related`), at the end of the article. */
export function RelatedDocuments({
  related,
}: {
  related: readonly WorkspaceDocsRelatedDocument[];
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
            <RelatedItem item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}
