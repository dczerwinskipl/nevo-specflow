import { Trans, useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import {
  Alert,
  AppContent,
  AppWorkspace,
  Button,
  EmptyState,
  Typography,
  WorkspaceHeader,
} from '@nevo/ui';
import type { DocsFailure } from '../read-model';

/** No `docs.view`: the whole surface says so (no tree, no picker). */
export function DocsForbidden() {
  const { t } = useTranslation();

  return (
    <AppWorkspace scroll="content" fit="bounded">
      <AppWorkspace.Primary header={<WorkspaceHeader title={t('docs.title')} />}>
        <AppContent className="h-full w-full">
          <EmptyState
            variant="pane"
            icon={Lock}
            title={t('docs.state.forbidden.title')}
            description={t('docs.state.forbidden.description')}
          />
        </AppContent>
      </AppWorkspace.Primary>
    </AppWorkspace>
  );
}

/** Why a workspace's documentation as a whole is not shown; it replaces the article area only. */
export type CorpusProblem = Exclude<DocsFailure, { kind: 'forbidden' }> | { kind: 'empty' };

/**
 * A problem of the whole documentation of a workspace, said where the article would be (Narrow:
 * under the picker). An unavailable workspace is an attention Alert with Try again.
 */
export function CorpusProblemView({
  problem,
  workspaceName,
  folder,
  onRetry,
}: {
  problem: CorpusProblem;
  workspaceName: string;
  /** The workspace's folder, as the picker shows it. */
  folder: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const retry = (
    <Button size="sm" variant="secondary" onClick={onRetry}>
      {t('docs.state.tryAgain')}
    </Button>
  );
  switch (problem.kind) {
    case 'not-configured':
      return (
        <EmptyState
          variant="inline"
          icon="book-open"
          title={t('docs.state.notConfigured.title')}
          description={
            <span className="wrap-anywhere">
              {/* The default root needs no repeating; a configured one is named. */}
              <Trans
                i18nKey={
                  problem.docsRoot && problem.docsRoot !== 'docs'
                    ? 'docs.state.notConfigured.descriptionRoot'
                    : 'docs.state.notConfigured.description'
                }
                values={{ workspace: workspaceName, docsRoot: problem.docsRoot }}
                components={{ code: <code /> }}
              />
            </span>
          }
        />
      );
    case 'empty':
      return (
        <EmptyState
          variant="inline"
          icon="book-open"
          title={t('docs.state.empty.title')}
          description={t('docs.state.empty.description', { workspace: workspaceName })}
        />
      );
    case 'workspace-unavailable':
    case 'workspace-not-found':
      return (
        <Alert tone="attention" title={t('docs.state.unavailable.title')} actions={retry}>
          <p className="wrap-anywhere">{t('docs.state.unavailable.description', { folder })}</p>
        </Alert>
      );
    case 'docs-unavailable':
      return (
        <Alert tone="attention" title={t('docs.state.docsUnavailable.title')} actions={retry}>
          <p>{t('docs.state.docsUnavailable.description')}</p>
        </Alert>
      );
    case 'other':
      return (
        <Alert tone="attention" title={t('docs.state.failed.title')} actions={retry}>
          <p>{t('docs.state.failed.description')}</p>
        </Alert>
      );
  }
}

/** Split layouts without a root index: one plain sentence beside the tree. */
export function NoIndexArticle({ workspaceName }: { workspaceName: string }) {
  const { t } = useTranslation();

  return (
    <div className="max-w-content-narrow p-6">
      <Typography as="p" variant="body-md" className="text-content-secondary">
        {t('docs.article.noIndex', { workspace: workspaceName })}
      </Typography>
    </div>
  );
}
