import { LoadingPresentation } from '../../../app/loading/LoadingPresentation';
import { useQuery } from '@tanstack/react-query';
import { isHttpClientError } from '@nevo/http-client';
import { Alert, Button, MarkdownDocument, useInitialAppearance } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { useAppServices } from '../../../app/useAppServices';
import { markdownIntro } from '../description/markdownIntro';
import { hasTextDraft } from '../content-kinds/kindId';
import { DocumentNonTextPreview } from './DocumentFileViews';
import { useMarkdownLabels } from '../../../i18n/useMarkdownLabels';
import { documentKeys } from '../read-model/queries';
import { documentOutline } from '../../../shared/document-reading/outlineData';
import { DocumentProperties } from '../../../shared/document-reading/DocumentProperties';
import { unreadableCauseOf, unreadableCopy } from '../../../shared/unreadable/unreadable';

export function DocumentContent({
  specId,
  documentId,
  expectedRevision,
  omitTitle,
  headingOffset = 0,
}: {
  readonly specId: string;
  readonly documentId: string;
  readonly expectedRevision?: string;
  readonly omitTitle?: string;
  readonly headingOffset?: 0 | 1 | 2 | 3 | 4 | 5;
}) {
  const { t } = useTranslation();
  const { documentApi } = useAppServices();
  const markdownLabels = useMarkdownLabels();
  const query = useQuery({
    queryKey: documentKeys.detail(specId, documentId, expectedRevision),
    queryFn: ({ signal }) => documentApi.getDocument(specId, documentId, signal, expectedRevision),
  });

  const matching =
    query.data?.id === documentId &&
    (!expectedRevision || query.data?.revision === expectedRevision);
  const status = isHttpClientError(query.error) ? query.error.status : undefined;
  const transient =
    isHttpClientError(query.error) &&
    (query.error.kind === 'network' ||
      query.error.kind === 'timeout' ||
      (status !== undefined && status >= 500));
  const blocked = query.isError && !transient;
  const usable = matching && !blocked;
  const appearance = useInitialAppearance(
    `${specId}:${documentId}:${expectedRevision ?? ''}`,
    query.isPending && query.fetchStatus === 'fetching',
    usable,
  );
  if (query.isPending) {
    return (
      <div ref={appearance}>
        <LoadingPresentation
          shape="document"
          label={t('loading.document')}
          fetching={query.fetchStatus === 'fetching'}
        />
      </div>
    );
  }

  if (query.isError && !usable) {
    const forbidden = isHttpClientError(query.error) && query.error.status === 403;
    const failed = unreadableCopy(unreadableCauseOf(query.error));
    const title = t(forbidden ? 'specification.resourceAccessDeniedTitle' : failed.title);
    const description = t(
      forbidden ? 'specification.resourceAccessDeniedDescription' : failed.description,
    );

    return (
      <div className="grid gap-3">
        <Alert tone="attention" role="alert" title={title}>
          {description}
        </Alert>
        <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div ref={appearance} className="grid min-w-0 gap-3">
      {usable && query.isError ? (
        <Alert tone="attention" role="status" title={t('specification.staleDataTitle')}>
          {t('specification.staleDataDescription')}
          <Button
            variant="secondary"
            size="sm"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {t('common.retry')}
          </Button>
        </Alert>
      ) : null}
      {usable && query.data && !hasTextDraft(query.data) ? (
        // Images and files without text to render have their own previews.
        <DocumentNonTextPreview specId={specId} document={query.data} />
      ) : usable && query.data ? (
        <MarkdownBody
          content={query.data.content ?? ''}
          omitTitle={omitTitle}
          headingOffset={headingOffset}
          labels={markdownLabels}
        />
      ) : (
        <Alert tone="attention" role="alert" title={t('unreadable.failed.title')} />
      )}
    </div>
  );
}

/**
 * The text as the full document view previews it: the leading YAML block is not rendered as
 * markdown but shown as the read-only Properties row (the same parse as the editor's preview).
 */
function MarkdownBody({
  content,
  omitTitle,
  headingOffset,
  labels,
}: {
  readonly content: string;
  readonly omitTitle?: string;
  readonly headingOffset: 0 | 1 | 2 | 3 | 4 | 5;
  readonly labels: ReturnType<typeof useMarkdownLabels>;
}) {
  const { properties, body } = documentOutline(content, true);

  return (
    <>
      {properties ? <DocumentProperties properties={properties} anchored={false} /> : null}
      <MarkdownDocument
        labels={labels}
        headingOffset={headingOffset}
        diagrams
        source={omitTitle ? markdownIntro(body, omitTitle).source : body}
      />
    </>
  );
}
