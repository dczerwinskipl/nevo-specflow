import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
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
import type { ExitBlocker, WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { useAppServices } from '../../../../app/useAppServices';
import { InlineAction } from '../InlineAction';
import { workflowRefusalOf } from '../refusal';
import { BlockerGroups, type BlockerTask } from './BlockerGroups';

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
}

/**
 * Close preflight: the workflow blockers of the projection (or of a `CLOSE_BLOCKED` preview) as
 * grouped blockers with only Dismiss; otherwise the Close the preview planned, with the cancelled
 * Tasks named as not delivered. Git and workspace rules are still checked by the Close itself.
 */
export function CloseSpecificationDialog(props: CloseSpecificationDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
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
}: CloseSpecificationDialogProps) {
  const { t } = useTranslation();
  const { workflowExecutionApi } = useAppServices();
  const exit = projection.specification?.exit?.close;
  const workflowBlockers = exit?.kind === 'blocked' ? exit.blockers : undefined;
  const preview = useQuery({
    queryKey: ['specifications', specId, 'close-preview'],
    queryFn: ({ signal }) => workflowExecutionApi.closePreview(specId, signal),
    enabled: workflowBlockers === undefined,
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });
  const close = useMutation({
    mutationFn: (operationId: string) => workflowExecutionApi.close(specId, operationId),
    onSuccess: (result) => {
      if (result.status === 'completed') {
        onClosed();
      }
    },
  });
  const previewRefusal = preview.isError ? workflowRefusalOf(preview.error) : undefined;
  const blockers: readonly ExitBlocker[] | undefined =
    workflowBlockers ??
    (previewRefusal?.code === 'CLOSE_BLOCKED' ? previewRefusal.blockers : undefined);
  const position: Position = projection.position;
  const abandonment =
    position.kind === 'terminal' && position.abandonment ? position.abandonment : undefined;
  const dismiss = () => onOpenChange(false);
  const go = (action: () => void) => () => {
    dismiss();
    action();
  };

  if (blockers) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t('workflowExecution.close.title', { title: specTitle })}</DialogTitle>
          <DialogDescription>
            {t('workflowExecution.close.blocked', { title: specTitle })}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-5">
          <BlockerGroups
            blockers={blockers}
            order="close"
            tasks={tasks}
            onOpenTask={(id) => go(() => onOpenTask(id))()}
            onSeeWorkflow={go(onSeeWorkflow)}
            onSeeTasks={go(onSeeTasks)}
          />
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
          <Button autoFocus onClick={dismiss}>
            {t('workflowExecution.exit.dismiss')}
          </Button>
        </DialogFooter>
      </>
    );
  }

  const closed = close.data;

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
        {preview.isError ? (
          <Alert role="alert" tone="danger" title={t('workflowExecution.close.previewFailed')}>
            {previewRefusal?.code ?? t('workflowExecution.refusal.generic')}
          </Alert>
        ) : null}
        {close.isError ? (
          <Alert role="alert" tone="danger" title={t('workflowExecution.close.failed')}>
            {workflowRefusalOf(close.error).code ?? t('workflowExecution.refusal.generic')}
          </Alert>
        ) : null}
        {closed && closed.status !== 'completed' ? (
          <Alert role="status" tone="attention" title={t('workflowExecution.close.notCompleted')}>
            {t(`workflowExecution.close.status.${closed.status}`)}
          </Alert>
        ) : null}
        {position.kind === 'terminal' && position.outcome === 'completed' ? (
          <Alert tone="success" title={t('workflowExecution.close.readyTitle')}>
            {t('workflowExecution.close.readyBody')}
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
              {cancelledTasks.map((task) => (
                <li key={task.id} className="min-w-0 [overflow-wrap:anywhere]">
                  <span className="font-mono text-content-muted">{task.id}</span> {task.title}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={dismiss}>
          {t('common.cancel')}
        </Button>
        <Button
          disabled={!preview.data || close.isPending || closed?.status === 'completed'}
          onClick={() => preview.data && close.mutate(preview.data.operationId)}
        >
          {t('workflowExecution.close.submit')}
        </Button>
      </DialogFooter>
    </>
  );
}
