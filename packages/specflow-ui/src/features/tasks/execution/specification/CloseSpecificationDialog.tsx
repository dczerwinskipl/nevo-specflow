import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Typography,
} from '@nevo/ui';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { useAppServices } from '../../../../app/useAppServices';
import { InlineAction } from '../InlineAction';
import { specsOverviewKeys } from '../../../specs/read-model';
import { invalidateAfterTaskChange } from '../../authoring/queries';
import { workflowRefusalOf } from '../refusal';
import { focusInitial } from '../focusInitial';
import {
  BlockerGroups,
  ITEMS_SHOWN,
  closeReasons,
  workflowAtOf,
  type BlockerTask,
} from './BlockerGroups';
import {
  DOCUMENT_COMMIT_RECHECK,
  closeDialogOutcome,
  waitsForDocumentCommits,
  type DocumentCommitRecheck,
} from './closeDialogOutcome';
import { RepositoryBlockers, repositoryReasons } from './RepositoryBlockers';

type Position = WorkflowActionProjection['position'];

export interface CloseSpecificationDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly specId: string;
  readonly specTitle: string;
  readonly projection: WorkflowActionProjection;
  readonly tasks: ReadonlyMap<string, BlockerTask>;
  /** The cancelled Tasks, listed as not delivered. */
  readonly cancelledTasks: readonly BlockerTask[];
  readonly onAbandonInstead?: () => void;
  readonly onSeeWorkflow: () => void;
  readonly onSeeTasks: () => void;
  readonly onOpenTask: (taskId: string) => void;
  readonly onClosed: () => void;
  /** How the preview is read again while document commits settle; the default outside tests. */
  readonly documentCommitRecheck?: DocumentCommitRecheck;
}

/**
 * Close preflight: the workflow blockers of the projection with the agent Turns running in the
 * checkout (the occupancy read), or the blockers and repository preconditions a preview or Close
 * refused with, as grouped blockers with only Dismiss; otherwise exactly one outcome of the preview
 * (`closeDialogOutcome`: checking, cannot start, ready) or of the Close, with the cancelled Tasks
 * named as not delivered.
 */
export function CloseSpecificationDialog(props: CloseSpecificationDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent closeLabel={t('common.close')} onOpenAutoFocus={focusInitial}>
        {props.open ? <CloseBody {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CloseBody({
  onOpenChange,
  specId,
  specTitle,
  projection,
  tasks,
  cancelledTasks,
  onAbandonInstead,
  onSeeWorkflow,
  onSeeTasks,
  onOpenTask,
  onClosed,
  documentCommitRecheck = DOCUMENT_COMMIT_RECHECK,
}: CloseSpecificationDialogProps) {
  const { t, i18n } = useTranslation();
  // The refusals counted before the last "Check again": the bound applies to each round of checks.
  const [rechecksFrom, setRechecksFrom] = useState(0);
  const { workflowExecutionApi } = useAppServices();
  const exit = projection.specification?.exit?.close;
  const workflowBlockers = exit?.kind === 'blocked' ? exit.blockers : undefined;
  const queryClient = useQueryClient();
  // The preview plans the Close: its operation id must stay the one the Close sends, so it is
  // read once per opening, outside the Specification caches that a Close refreshes.
  const preview = useQuery({
    queryKey: ['close-preview', specId],
    queryFn: ({ signal }) => workflowExecutionApi.closePreview(specId, signal),
    enabled: workflowBlockers === undefined,
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Saved documents still queued for their commit settle by themselves: read the preview again
    // until they do (then it plans the Close or names the real blockers). Stops when the dialog
    // closes, since the query unmounts with it.
    refetchInterval: (query) =>
      query.state.status === 'error' &&
      waitsForDocumentCommits(workflowRefusalOf(query.state.error)) &&
      query.state.errorUpdateCount - rechecksFrom < documentCommitRecheck.attempts
        ? documentCommitRecheck.intervalMs
        : false,
  });
  const checkAgain = () => {
    setRechecksFrom(preview.errorUpdateCount);
    void preview.refetch();
  };

  // A Close the workflow blocks is not planned; the running agent Turns that would hold its
  // checkout too are read on their own, so both are listed at once.
  const occupancy = useQuery({
    queryKey: ['close-occupancy', specId],
    queryFn: ({ signal }) => workflowExecutionApi.closeOccupancy(specId, signal),
    enabled: workflowBlockers !== undefined,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const close = useMutation({
    mutationFn: (operationId: string) => workflowExecutionApi.close(specId, operationId),
    // Whatever the answer, the Specification may have changed (closed, archived, partly done).
    onSettled: () =>
      Promise.all([
        invalidateAfterTaskChange(queryClient, specId),
        queryClient.invalidateQueries({ queryKey: specsOverviewKeys.all }),
      ]),
    onSuccess: (result) => {
      if (result.status === 'completed') {
        onClosed();
      }
    },
  });
  const outcome = closeDialogOutcome({
    ...(workflowBlockers ? { workflowBlockers } : {}),
    ...(occupancy.data ? { occupancyBlockers: occupancy.data.blockers } : {}),
    preview: preview.isError
      ? {
          status: 'error',
          refusal: workflowRefusalOf(preview.error),
          documentRechecksExhausted:
            preview.errorUpdateCount - rechecksFrom >= documentCommitRecheck.attempts,
        }
      : preview.isSuccess
        ? { status: 'success' }
        : { status: 'pending' },
    close: close.isError
      ? { status: 'error', refusal: workflowRefusalOf(close.error) }
      : close.isSuccess
        ? { status: 'success', result: close.data }
        : { status: close.isPending ? 'pending' : 'idle' },
  });
  const position: Position = projection.position;
  const abandonment =
    position.kind === 'terminal' && position.abandonment ? position.abandonment : undefined;
  const dismiss = () => onOpenChange(false);
  const go = (action: () => void) => () => {
    dismiss();
    action();
  };

  if (outcome.kind === 'blocked') {
    const { blockers, repository } = outcome;

    return (
      <>
        <DialogHeader>
          <DialogTitle>{t('workflowExecution.close.title', { title: specTitle })}</DialogTitle>
          <DialogDescription>
            {t('workflowExecution.close.blocked', {
              title: specTitle,
              reasons: closeReasons(
                t,
                i18n.language,
                blockers,
                tasks,
                workflowAtOf(position),
                repositoryReasons(t, repository),
              ),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-5">
          {blockers.length > 0 ? (
            <BlockerGroups
              blockers={blockers}
              order="close"
              tasks={tasks}
              workflowAt={workflowAtOf(position)}
              onOpenTask={(id) => go(() => onOpenTask(id))()}
              onSeeWorkflow={go(onSeeWorkflow)}
              onSeeTasks={go(onSeeTasks)}
            />
          ) : null}
          {repository.length > 0 ? <RepositoryBlockers repository={repository} /> : null}
          {onAbandonInstead ? (
            <Typography as="p" variant="body-sm" className="text-content-secondary">
              {t('workflowExecution.close.abandonPrompt')}{' '}
              <InlineAction onClick={onAbandonInstead}>
                {t('workflowExecution.close.abandonInstead')}
              </InlineAction>
            </Typography>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button data-initial-focus="" onClick={dismiss}>
            {t('workflowExecution.exit.dismiss')}
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('workflowExecution.close.title', { title: specTitle })}</DialogTitle>
        <DialogDescription>
          {abandonment
            ? t('workflowExecution.close.afterAbandon', { reason: abandonment.reason })
            : t('workflowExecution.close.ready')}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="grid gap-5">
        {outcome.kind === 'checking' ? (
          <Alert
            role="status"
            tone="neutral"
            title={
              outcome.waitingFor === 'documents'
                ? t('workflowExecution.close.documentsCheckingTitle')
                : t('workflowExecution.close.checkingTitle')
            }
          >
            {outcome.waitingFor === 'documents'
              ? t('workflowExecution.close.documentsCheckingBody')
              : t('workflowExecution.close.checkingBody')}
          </Alert>
        ) : null}
        {outcome.kind === 'cannot-start' ? (
          <Alert role="alert" tone="danger" title={t('workflowExecution.close.previewFailed')}>
            {t(outcome.reasonKey)}{' '}
            <InlineAction onClick={checkAgain}>
              {t('workflowExecution.close.checkAgain')}
            </InlineAction>
          </Alert>
        ) : null}
        {outcome.kind === 'not-closed' ? (
          <Alert role="alert" tone="danger" title={t('workflowExecution.close.failed')}>
            {t(outcome.reasonKey)}
          </Alert>
        ) : null}
        {outcome.kind === 'needs-attention' ? (
          <Alert role="status" tone="attention" title={t('workflowExecution.close.notCompleted')}>
            {t(`workflowExecution.close.status.${outcome.status}`)}
          </Alert>
        ) : null}
        {outcome.kind === 'closing' ? (
          <Alert role="status" tone="neutral" title={t('workflowExecution.close.closingTitle')}>
            {t('workflowExecution.close.closingBody')}
          </Alert>
        ) : null}
        {outcome.kind === 'ready' ? (
          <Alert tone="success" title={t('workflowExecution.close.readyTitle')}>
            {abandonment
              ? t('workflowExecution.close.readyAbandonedBody')
              : position.kind === 'terminal'
                ? t('workflowExecution.close.readyBody')
                : t('workflowExecution.close.readyChecksBody')}
          </Alert>
        ) : null}
        {cancelledTasks.length > 0 ? (
          <section className="grid gap-2" aria-label={t('workflowExecution.close.notDelivered')}>
            <div className="grid gap-0.5">
              <Typography as="h3" variant="label-sm">
                {t('workflowExecution.exit.groupHeading', {
                  title: t('workflowExecution.close.notDelivered'),
                  count: cancelledTasks.length,
                })}
              </Typography>
              <Typography as="p" variant="body-sm" className="text-content-secondary">
                {t('workflowExecution.close.notDeliveredExplanation')}
              </Typography>
            </div>
            <ul className="grid gap-1 text-body-sm">
              {cancelledTasks.slice(0, ITEMS_SHOWN).map((task) => (
                <li key={task.id} className="min-w-0 [overflow-wrap:anywhere]">
                  <span className="font-mono text-content-muted">{task.id}</span> {task.title}
                </li>
              ))}
              {cancelledTasks.length > ITEMS_SHOWN ? (
                <li>
                  <InlineAction onClick={go(onSeeTasks)}>
                    {t('workflowExecution.exit.more', {
                      count: cancelledTasks.length - ITEMS_SHOWN,
                    })}
                  </InlineAction>
                </li>
              ) : null}
            </ul>
          </section>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button data-initial-focus="" variant="secondary" onClick={dismiss}>
          {t('common.cancel')}
        </Button>
        <Button
          disabled={!preview.data || close.isPending || close.data?.status === 'completed'}
          onClick={() => preview.data && close.mutate(preview.data.operationId)}
        >
          {t('workflowExecution.close.submit')}
        </Button>
      </DialogFooter>
    </>
  );
}
