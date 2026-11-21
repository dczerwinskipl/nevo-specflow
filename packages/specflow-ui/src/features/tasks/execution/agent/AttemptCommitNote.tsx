import { Trans, useTranslation } from 'react-i18next';
import { GitCommitHorizontal } from 'lucide-react';
import { Button, InlineNote } from '@nevo/ui';
import { WorkflowRefusalAlert } from '../WorkflowRefusalAlert';

const CODE = <span className="font-mono whitespace-nowrap text-content-primary" />;
const STRONG = <span className="font-medium text-content-primary" />;
const MONO = 'font-mono text-content-primary [overflow-wrap:anywhere]';
/** At most this many files are named, as the Close dialog lists them; the rest are counted. */
const PATHS_SHOWN = 5;

/**
 * What became of the work of an agent attempt that finished (the commit it makes when the agent
 * finishes, D15), as the Now block of the step that follows says it.
 */
export type AttemptCommitView =
  | {
      readonly state: 'committed';
      readonly stepTitle: string;
      readonly sha: string;
      readonly branch?: string;
      readonly documents: number;
      readonly files: number;
    }
  | {
      readonly state: 'failed';
      /** The attempt whose commit Retry commit makes again. */
      readonly step: string;
      readonly attempt: number;
      readonly stepTitle: string;
      /** The step that cannot be run with an agent until the commit is made. */
      readonly nextTitle?: string;
      readonly code: string;
      readonly branch?: string;
      readonly paths: readonly string[];
      readonly count?: number;
    };

/** Why the commit failed in plain words; any other code is named, never explained by a guess. */
const REASONS: Readonly<Record<string, 'branchProtected' | 'blocked'>> = {
  BRANCH_PROTECTED: 'branchProtected',
  COMMIT_BLOCKED: 'blocked',
};

function Committed({
  commit,
}: {
  readonly commit: Extract<AttemptCommitView, { state: 'committed' }>;
}) {
  return (
    <InlineNote tone="info" icon={GitCommitHorizontal} data-now-attempt-commit="committed">
      <Trans
        i18nKey={
          commit.branch
            ? 'workflowExecution.attemptCommit.committedOn'
            : 'workflowExecution.attemptCommit.committed'
        }
        values={{
          step: commit.stepTitle,
          sha: commit.sha,
          branch: commit.branch,
          documents: commit.documents,
          files: commit.files,
        }}
        components={{ code: CODE }}
      />
    </InlineNote>
  );
}

function Failed({
  commit,
  retrying,
  error,
  onRetry,
}: {
  readonly commit: Extract<AttemptCommitView, { state: 'failed' }>;
  readonly retrying: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
}) {
  const { t } = useTranslation();
  const shown = commit.paths.slice(0, PATHS_SHOWN);
  const count = commit.count ?? commit.paths.length;
  const more = count - shown.length;
  const reason = t(`workflowExecution.attemptCommit.reason.${REASONS[commit.code] ?? 'other'}`);

  return (
    <div className="grid gap-2" data-now-attempt-commit="failed">
      <InlineNote tone="attention" role="alert">
        <Trans
          i18nKey="workflowExecution.attemptCommit.failed"
          values={{ step: commit.stepTitle, reason, code: commit.code }}
          components={{ strong: STRONG, code: CODE }}
        />{' '}
        <Trans
          i18nKey={
            commit.branch
              ? 'workflowExecution.attemptCommit.staysOn'
              : 'workflowExecution.attemptCommit.stays'
          }
          count={count}
          values={{ branch: commit.branch }}
          components={{ code: CODE }}
        />{' '}
        {commit.nextTitle
          ? t('workflowExecution.attemptCommit.blocksNext', { next: commit.nextTitle })
          : t('workflowExecution.attemptCommit.blocksAgent')}
        <ul className="mt-1 grid list-disc gap-0.5 pl-5 text-body-sm marker:text-content-muted">
          {shown.map((path) => (
            <li key={path} className={MONO}>
              {path}
            </li>
          ))}
          {more > 0 ? (
            <li className="list-none text-content-muted">
              {t('workflowExecution.agent.blocker.dirty.more', { count: more })}
            </li>
          ) : null}
        </ul>
        <div className="mt-2">
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={GitCommitHorizontal}
            onClick={onRetry}
            disabled={retrying}
            aria-busy={retrying}
          >
            {retrying
              ? t('workflowExecution.attemptCommit.retrying')
              : t('workflowExecution.attemptCommit.retry')}
          </Button>
        </div>
      </InlineNote>
      {error ? <WorkflowRefusalAlert error={error} /> : null}
    </div>
  );
}

/** The commit of a finished agent attempt: where it landed, or why it did not and the way on. */
export function AttemptCommitNote({
  commit,
  retrying,
  error,
  onRetry,
}: {
  readonly commit: AttemptCommitView;
  readonly retrying: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
}) {
  return commit.state === 'committed' ? (
    <Committed commit={commit} />
  ) : (
    <Failed commit={commit} retrying={retrying} error={error} onRetry={onRetry} />
  );
}
