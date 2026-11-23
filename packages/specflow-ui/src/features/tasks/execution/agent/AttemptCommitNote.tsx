import { useEffect, useState } from 'react';
import type { TFunction } from 'i18next';
import { Trans, useTranslation } from 'react-i18next';
import { GitCommitHorizontal } from 'lucide-react';
import { Button, InlineNote } from '@nevo/ui';
import { WorkflowRefusalAlert } from '../WorkflowRefusalAlert';
import { POLL_MS } from './usePolling';

const CODE = <span className="font-mono whitespace-nowrap text-content-primary" />;
const STRONG = <span className="font-medium text-content-primary" />;
const MONO = 'font-mono text-content-primary [overflow-wrap:anywhere]';
/** At most this many files are named, as the Close dialog lists them; the rest are counted. */
const PATHS_SHOWN = 5;
/**
 * A commit still pending after this many reads of the projection made no progress (an interruption
 * left it pending): the note offers Retry commit, the same action as after a failure.
 */
const COMMIT_STALLED_MS = 3 * POLL_MS;

/** Whether `afterMs` passed since the caller mounted (a note shown while a state lasts). */
function useStalled(afterMs: number): boolean {
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setStalled(true), afterMs);

    return () => window.clearTimeout(timer);
  }, [afterMs]);

  return stalled;
}

function RetryButton({
  retrying,
  onRetry,
}: {
  readonly retrying: boolean;
  readonly onRetry: () => void;
}) {
  const { t } = useTranslation();

  return (
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
  );
}

/**
 * What became of the work of an agent attempt that finished (the commit it makes when the agent
 * finishes, D15), as the Now block of the step that follows, or of the result waiting for the
 * owner's confirmation, says it. `waits: 'confirm'`: the owner's Confirm and Reject wait for the
 * commit; `waits: 'workflow'`: nothing of the specification's workflow can change until it ran.
 */
export type AttemptCommitView =
  | {
      readonly state: 'committed';
      readonly stepTitle: string;
      readonly branch?: string;
      /** The commit the attempt made, with how many of its paths are documents and files. */
      readonly sha?: string;
      readonly documents?: number;
      readonly files?: number;
    }
  | {
      readonly state: 'pending';
      readonly stepTitle: string;
      readonly waits?: 'workflow';
    }
  | {
      readonly state: 'failed';
      readonly waits?: 'confirm' | 'workflow';
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

/** Why a commit failed, in plain words (the Close dialog and the history say it the same way). */
export function commitReason(t: TFunction, code: string): string {
  return t(`workflowExecution.attemptCommit.reason.${REASONS[code] ?? 'other'}`);
}

function Committed({
  commit,
}: {
  readonly commit: Extract<AttemptCommitView, { state: 'committed' }>;
}) {
  const { t } = useTranslation();
  const counts = [
    commit.documents
      ? t('workflowExecution.attemptCommit.countDocuments', { count: commit.documents })
      : undefined,
    commit.files
      ? t('workflowExecution.attemptCommit.countFiles', { count: commit.files })
      : undefined,
  ].filter(Boolean);
  const list =
    counts.length > 0 ? `: ${counts.join(t('workflowExecution.attemptCommit.and'))}` : '';
  const key = commit.sha
    ? commit.branch
      ? 'workflowExecution.attemptCommit.committedShaOn'
      : 'workflowExecution.attemptCommit.committedSha'
    : commit.branch
      ? 'workflowExecution.attemptCommit.committedOn'
      : 'workflowExecution.attemptCommit.committed';

  return (
    <InlineNote tone="info" icon={GitCommitHorizontal} data-now-attempt-commit="committed">
      <Trans
        i18nKey={key}
        values={{
          step: commit.stepTitle,
          branch: commit.branch,
          sha: commit.sha?.slice(0, 7),
          list,
        }}
        components={{ code: CODE }}
      />
    </InlineNote>
  );
}

function Pending({
  commit,
  retrying,
  error,
  onRetry,
}: {
  readonly commit: Extract<AttemptCommitView, { state: 'pending' }>;
  readonly retrying: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
}) {
  const { t } = useTranslation();
  // The reads keep showing it pending: it may never end by itself, so Retry commit is offered.
  const stalled = useStalled(COMMIT_STALLED_MS);

  return (
    <div className="grid gap-2" data-now-attempt-commit="pending">
      <InlineNote tone="info" icon={GitCommitHorizontal} role="status">
        {t('workflowExecution.attemptCommit.pending', { step: commit.stepTitle })}
        {commit.waits === 'workflow' ? (
          <> {t('workflowExecution.attemptCommit.blocksWorkflow')}</>
        ) : null}
        {stalled || retrying ? (
          <>
            {' '}
            {commit.waits === 'workflow'
              ? t('workflowExecution.attemptCommit.stalledWorkflow')
              : t('workflowExecution.attemptCommit.stalled')}
            <div className="mt-2">
              <RetryButton retrying={retrying} onRetry={onRetry} />
            </div>
          </>
        ) : null}
      </InlineNote>
      {error ? <WorkflowRefusalAlert error={error} /> : null}
    </div>
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
  const reason = commitReason(t, commit.code);

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
        {commit.waits === 'confirm'
          ? t('workflowExecution.attemptCommit.blocksConfirm')
          : commit.waits === 'workflow'
            ? t('workflowExecution.attemptCommit.blocksWorkflowFailed')
            : commit.nextTitle
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
          <RetryButton retrying={retrying} onRetry={onRetry} />
        </div>
      </InlineNote>
      {error ? <WorkflowRefusalAlert error={error} /> : null}
    </div>
  );
}

/**
 * The commit of a finished agent attempt: where it landed, that it is being made (with Retry commit
 * once it stays pending past {@link COMMIT_STALLED_MS}), or why it was not and the way on.
 */
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
  ) : commit.state === 'pending' ? (
    <Pending commit={commit} retrying={retrying} error={error} onRetry={onRetry} />
  ) : (
    <Failed commit={commit} retrying={retrying} error={error} onRetry={onRetry} />
  );
}
