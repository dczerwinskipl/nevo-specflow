import type { DocumentAttemptCommit } from '@nevo/specflow-contracts/documents';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { GitCommitHorizontal } from 'lucide-react';
import { Button, InlineNote } from '@nevo/ui';
import { useAppServices } from '../../../app/useAppServices';
import { specificationActionsKey } from '../../tasks/read-model';
import { documentTreeKeys } from '../read-model/queries';

const CODE = <span className="font-mono whitespace-nowrap text-content-primary" />;

/**
 * Why a document an agent attempt's commit still takes cannot be edited, before any edit (the
 * editor is read-only and Save unavailable meanwhile): the agent's work on it is not committed yet,
 * pending (SpecFlow is committing it) or failed (with its code), and Retry commit makes that commit
 * again (`POST .../workflow/attempt-commit/retry` of the attempt). The same action as the workflow's
 * notice of that attempt; after it the tree and the workflow are read again.
 */
export function AttemptCommitDocumentNote({
  specId,
  hold,
}: {
  readonly specId: string;
  readonly hold: DocumentAttemptCommit;
}) {
  const { t } = useTranslation();
  const { workflowExecutionApi } = useAppServices();
  const cache = useQueryClient();
  const subject = {
    specId: hold.subject.specId,
    ...(hold.subject.taskId !== undefined ? { taskId: hold.subject.taskId } : {}),
  };
  const retry = useMutation({
    mutationFn: () =>
      workflowExecutionApi.retryAttemptCommit(subject, { step: hold.step, attempt: hold.attempt }),
    onSettled: () =>
      Promise.all([
        cache.invalidateQueries({ queryKey: documentTreeKeys.tree(specId), exact: true }),
        cache.invalidateQueries({ queryKey: specificationActionsKey(specId), exact: true }),
        cache.invalidateQueries({ queryKey: ['workflow', 'history', hold.subject.specId] }),
      ]),
  });
  const step = hold.stepTitle || hold.step;
  const failed = hold.reason === 'attempt-commit-failed';

  return (
    <InlineNote
      tone={failed ? 'attention' : 'info'}
      icon={GitCommitHorizontal}
      role={failed ? 'alert' : 'status'}
      data-document-attempt-commit={failed ? 'failed' : 'pending'}
    >
      {t('documents.attemptCommit.held', { step })}{' '}
      {failed ? (
        <Trans
          i18nKey="documents.attemptCommit.failed"
          values={{ code: hold.code ?? 'COMMIT_FAILED' }}
          components={{ code: CODE }}
        />
      ) : (
        t('documents.attemptCommit.pending')
      )}
      {retry.isError ? <> {t('documents.attemptCommit.retryFailed')}</> : null}
      <div className="mt-2">
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={GitCommitHorizontal}
          onClick={() => retry.mutate()}
          disabled={retry.isPending}
          aria-busy={retry.isPending}
        >
          {retry.isPending
            ? t('workflowExecution.attemptCommit.retrying')
            : t('workflowExecution.attemptCommit.retry')}
        </Button>
      </div>
    </InlineNote>
  );
}
