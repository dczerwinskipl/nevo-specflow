import { cn, Icon, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { RepoContext } from '../model';
import { useWorkspaceRuntime } from '../WorkspaceContext';

export interface RepositorySectionProps {
  readonly repoContext: RepoContext;
}

export function RepositorySection({ repoContext }: RepositorySectionProps) {
  const { t } = useTranslation();
  const runtime = useWorkspaceRuntime();

  return (
    <section aria-labelledby="repo-heading" className="grid gap-2">
      <div className="flex items-center gap-2">
        <span className="flex size-4 shrink-0 items-center justify-center text-content-muted">
          <Icon name="branch" size="sm" />
        </span>
        <Typography
          as="h2"
          variant="title-sm"
          id="repo-heading"
          className="font-semibold text-content-primary"
        >
          {t('specification.repositoryHeading')}
        </Typography>
      </div>

      <div className="flex flex-wrap items-baseline gap-3 text-body-sm">
        <span className="font-medium text-content-primary">{repoContext.branch}</span>
        <span className="text-content-muted">
          {t('specification.baseBranchLabel', { base: repoContext.baseBranch })}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-xs text-content-secondary">
        <span className={cn(repoContext.isDirty && 'text-status-attention')}>
          {repoContext.freshness === 'unknown'
            ? t('specification.gitLocalChangesUnknown')
            : t('specification.uncommittedFilesCount', {
                count: repoContext.uncommittedCount,
              })}
        </span>
        <span aria-hidden="true" className="text-content-muted">
          ·
        </span>
        <span>
          {repoContext.freshness === 'unknown'
            ? t('specification.gitSyncUnknown')
            : repoContext.syncStatus}
        </span>
        <span aria-hidden="true" className="text-content-muted">
          ·
        </span>
        <span>
          {repoContext.freshness === 'unknown'
            ? t('specification.gitConflictsUnknown')
            : repoContext.conflictStatus}
        </span>
      </div>

      {repoContext.linkedPr ? (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-2 text-body-sm">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-body-xs text-content-muted">
              PR #{repoContext.linkedPr.number}
            </span>
            <span className="font-medium text-content-primary">{repoContext.linkedPr.title}</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => runtime.openChanges('mr')}
              className="text-body-xs font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
            >
              {t('specification.prReviewLink')}
            </button>
            <button
              type="button"
              onClick={() => runtime.openChanges('base')}
              className="text-body-xs font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
            >
              {t('specification.changesLink')}
            </button>
          </div>
        </div>
      ) : null}

      {repoContext.freshness !== 'fresh' ? (
        <div className="mt-1 flex items-center gap-3 text-body-xs text-content-muted">
          <span>
            {repoContext.freshness === 'unknown'
              ? t('specification.gitRefreshFailed')
              : t('specification.gitStaleData')}
          </span>
          <button
            type="button"
            onClick={() => void runtime.refresh()}
            className="font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : null}
    </section>
  );
}
