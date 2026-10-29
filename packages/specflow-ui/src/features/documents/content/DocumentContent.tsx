import { LoadingPresentation } from '../../../app/loading/LoadingPresentation';
import { useQuery } from '@tanstack/react-query';
import { isHttpClientError } from '@nevo/http-client';
import { Alert, Button, MarkdownDocument, useInitialAppearance } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { useAppServices } from '../../../app/useAppServices';
import { markdownIntro } from '../description/markdownIntro';
import { hasTextDraft } from '../content-kinds/kindId';
import { DocumentNonTextPreview } from './DocumentFileViews';
import { useMarkdownLabels } from '../useMarkdownLabels';
import { documentKeys } from '../read-model/queries';

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
    const title = t(
      forbidden ? 'specification.resourceAccessDeniedTitle' : 'specification.unavailableTitle',
    );
    const description = forbidden
      ? t('specification.resourceAccessDeniedDescription')
      : t('specification.unavailableDescription', { id: documentId });

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
        <MarkdownDocument
          labels={markdownLabels}
          headingOffset={headingOffset}
          source={
            omitTitle
              ? markdownIntro(query.data.content ?? '', omitTitle).source
              : (query.data.content ?? '')
          }
        />
      ) : (
        <Alert tone="attention" role="alert" title={t('specification.unavailableTitle')} />
      )}
    </div>
  );
}
