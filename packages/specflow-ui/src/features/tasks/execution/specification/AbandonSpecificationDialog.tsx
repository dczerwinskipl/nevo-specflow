import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  TextArea,
  Typography,
} from '@nevo/ui';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { useAppServices } from '../../../../app/useAppServices';
import { invalidateAfterTaskChange } from '../../authoring/queries';
import { workflowRefusalOf } from '../refusal';
import { WorkflowRefusalAlert } from '../WorkflowRefusalAlert';
import { BlockerGroups, type BlockerTask } from './BlockerGroups';

export interface AbandonSpecificationDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly specId: string;
  readonly specTitle: string;
  readonly projection: WorkflowActionProjection;
  readonly tasks: ReadonlyMap<string, BlockerTask>;
  /** Tasks that are neither done nor cancelled: the abandon cancels them. */
  readonly unfinishedTasks: readonly BlockerTask[];
  /** Tasks with work in progress: their active attempt ends as abandoned, the work is kept. */
  readonly activeTasks: readonly BlockerTask[];
  readonly onOpenTask: (taskId: string) => void;
}

/**
 * Abandon: end the Specification without delivering it, with a required reason. It is final. What
 * still runs (pending writes, an operation in progress) blocks it, grouped like Close, with only
 * Dismiss.
 */
export function AbandonSpecificationDialog(props: AbandonSpecificationDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        {props.open ? <AbandonBody {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AbandonBody({
  onOpenChange,
  specId,
  specTitle,
  projection,
  tasks,
  unfinishedTasks,
  activeTasks,
  onOpenTask,
}: AbandonSpecificationDialogProps) {
  const { t } = useTranslation();
  const formId = useId();
  const { workflowExecutionApi } = useAppServices();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const abandon = useMutation({
    mutationFn: (text: string) => workflowExecutionApi.abandon(specId, text),
    onSettled: () => invalidateAfterTaskChange(queryClient, specId),
    onSuccess: () => onOpenChange(false),
  });
  const exit = projection.specification?.exit?.abandon;
  const refusal = abandon.isError ? workflowRefusalOf(abandon.error) : undefined;
  const blockers =
    exit?.kind === 'blocked'
      ? exit.blockers
      : refusal?.code === 'WORKFLOW_EXIT_BLOCKED' && refusal.blockers.length > 0
        ? refusal.blockers
        : undefined;
  const dismiss = () => onOpenChange(false);

  if (blockers) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t('workflowExecution.abandon.title', { title: specTitle })}</DialogTitle>
          <DialogDescription>
            {t('workflowExecution.abandon.blocked', { title: specTitle })}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <BlockerGroups
            blockers={blockers}
            order="abandon"
            tasks={tasks}
            onOpenTask={(id) => {
              dismiss();
              onOpenTask(id);
            }}
          />
        </DialogBody>
        <DialogFooter>
          <Button autoFocus onClick={dismiss}>
            {t('workflowExecution.exit.dismiss')}
          </Button>
        </DialogFooter>
      </>
    );
  }

  const missing = reason.trim() === '';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (missing || abandon.isPending) {
      return;
    }

    abandon.mutate(reason.trim());
  };

  const workflowTitle = projection.workflow?.title ?? '';

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('workflowExecution.abandon.title', { title: specTitle })}</DialogTitle>
        <DialogDescription>{t('workflowExecution.abandon.description')}</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <form id={formId} noValidate onSubmit={submit} className="grid gap-5">
          {abandon.isError ? <WorkflowRefusalAlert error={abandon.error} /> : null}
          <div className="grid gap-1.5">
            <Typography as="h3" variant="label-sm">
              {t('workflowExecution.abandon.whatHappens')}
            </Typography>
            <ul className="grid list-disc gap-1 pl-5 text-body-sm text-content-secondary">
              <li>{t('workflowExecution.abandon.endsWorkflow', { workflow: workflowTitle })}</li>
              {activeTasks.length > 0 ? (
                <li>
                  {t('workflowExecution.abandon.endsAttempts')}
                  <ul className="mt-1 grid gap-0.5 pl-4">
                    {activeTasks.map((task) => (
                      <li key={task.id} className="[overflow-wrap:anywhere]">
                        <span className="font-mono">{task.id}</span> · {task.title}
                        {task.state ? ` · ${task.state}` : null}
                      </li>
                    ))}
                  </ul>
                </li>
              ) : null}
              {unfinishedTasks.length > 0 ? (
                <li>
                  {t('workflowExecution.abandon.cancelsTasks', {
                    count: unfinishedTasks.length,
                    ids: unfinishedTasks.map((task) => task.id).join(', '),
                  })}
                </li>
              ) : null}
              <li>{t('workflowExecution.abandon.nothingDelivered')}</li>
            </ul>
          </div>
          <Field>
            <Field.Label>{t('workflowExecution.abandon.reason')}</Field.Label>
            <TextArea
              rows={3}
              value={reason}
              aria-required
              maxLength={2000}
              onChange={(event) => setReason(event.target.value)}
            />
            <Field.Description>{t('workflowExecution.abandon.reasonHint')}</Field.Description>
          </Field>
        </form>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={dismiss}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          form={formId}
          variant="destructive"
          disabled={missing || abandon.isPending}
        >
          {t('workflowExecution.abandon.submit')}
        </Button>
      </DialogFooter>
    </>
  );
}
