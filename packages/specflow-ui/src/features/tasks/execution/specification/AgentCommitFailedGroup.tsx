import { useTranslation } from 'react-i18next';
import { Button, Typography } from '@nevo/ui';
import type { UncommittedAttempt } from '@nevo/specflow-contracts/documents';
import { commitReason } from '../agent/AttemptCommitNote';
import { useAgentAttemptCommands } from '../agent/useAgentAttemptCommands';
import { WorkflowRefusalAlert } from '../WorkflowRefusalAlert';
import { Group, MONO, UNCOMMITTED_PATHS_SHOWN } from './CloseGroup';
import { productIcons } from '../../../../shared/product-icons';

/** One attempt: what it was, why its commit failed, its files and Retry commit. */
function AttemptEntry({
  attempt,
  onRetried,
}: {
  readonly attempt: UncommittedAttempt;
  /** The commit was made: the Close is checked again. */
  readonly onRetried: () => void;
}) {
  const { t } = useTranslation();
  const subject =
    attempt.taskId === undefined
      ? { specId: attempt.specId }
      : { specId: attempt.specId, taskId: attempt.taskId };
  const { retryCommit } = useAgentAttemptCommands(subject);
  const shown = attempt.paths.slice(0, UNCOMMITTED_PATHS_SHOWN);
  const more = attempt.count - shown.length;
  const step = t(
    attempt.taskId === undefined
      ? 'workflowExecution.close.agentCommit.stepSpecification'
      : 'workflowExecution.close.agentCommit.stepTask',
    { step: attempt.stepTitle, task: attempt.taskId, attempt: attempt.attempt },
  );

  return (
    <div className="grid min-w-0 gap-1.5" data-agent-commit-attempt={attempt.attemptId}>
      <Typography as="p" variant="body-sm" className="text-content-primary">
        {step}
        {': '}
        {t('workflowExecution.close.agentCommit.reason', {
          reason: commitReason(t, attempt.code),
          code: attempt.code,
          count: attempt.count,
        })}
      </Typography>
      <ul className="grid list-disc gap-0.5 pl-5 text-body-sm marker:text-content-muted">
        {shown.map((path) => (
          <li key={path} className={MONO}>
            {path}
          </li>
        ))}
        {more > 0 ? (
          <li className="list-none text-content-muted">
            {t('workflowExecution.exit.more', { count: more })}
          </li>
        ) : null}
      </ul>
      <div>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={productIcons.commit}
          aria-label={t('workflowExecution.close.agentCommit.retryLabel', {
            step: attempt.stepTitle,
          })}
          disabled={retryCommit.isPending}
          aria-busy={retryCommit.isPending}
          onClick={() =>
            retryCommit.mutate(
              { step: attempt.step, attempt: attempt.attempt },
              { onSuccess: onRetried },
            )
          }
        >
          {retryCommit.isPending
            ? t('workflowExecution.attemptCommit.retrying')
            : t('workflowExecution.attemptCommit.retry')}
        </Button>
      </div>
      {retryCommit.isError ? <WorkflowRefusalAlert error={retryCommit.error} /> : null}
    </div>
  );
}

/**
 * Agent work whose commit failed, a group of the Close's uncommitted changes (D15, D16): per
 * attempt which step of which Task, why its commit failed in plain words, the files and Retry
 * commit, the way forward. The same attempts the CLI lists.
 */
export function AgentCommitFailedGroup({
  attempts,
  onRetried,
}: {
  readonly attempts: readonly UncommittedAttempt[];
  readonly onRetried: () => void;
}) {
  const { t } = useTranslation();
  const count = attempts.reduce((sum, attempt) => sum + attempt.count, 0);

  return (
    <Group
      heading={t('workflowExecution.exit.groupHeading', {
        title: t('workflowExecution.close.agentCommit.title'),
        count,
      })}
      explanation={t('workflowExecution.close.agentCommit.lead')}
    >
      <div className="grid gap-4">
        {attempts.map((attempt) => (
          <AttemptEntry key={attempt.attemptId} attempt={attempt} onRetried={onRetried} />
        ))}
      </div>
    </Group>
  );
}
