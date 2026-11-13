import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  DescriptionList,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nevo/ui';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { workflowRefusalOf } from './refusal';
import { WorkflowRefusalAlert } from './WorkflowRefusalAlert';

type Position = WorkflowActionProjection['position'];
export type PinPreview = Extract<Position, { kind: 'not-started' }>['preview'];

export interface StartTaskDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly taskId: string;
  readonly typeTitle: string;
  /** What a start pins now (the projection's preview, read again after a refusal). */
  readonly preview: PinPreview;
  /** The preview the owner confirmed last, when the start was refused because it changed. */
  readonly confirmed?: PinPreview;
  readonly pending: boolean;
  readonly error: unknown;
  readonly onConfirm: () => void;
  /** The lifecycle actions offered when the Task Type is no longer allowed (when allowed). */
  readonly onCancelTask?: () => void;
  readonly onRemoveTask?: () => void;
}

/**
 * The first start of a Task confirms the binding it pins (Task Type, workflow and revision, first
 * step) and sends the previewed revision. A refusal reuses the dialog, focused on its dismiss: a
 * workflow that changed meanwhile re-opens on the new revision; a Task Type that is no longer allowed
 * offers to cancel or remove the Task (its type cannot change).
 */
export function StartTaskDialog({
  open,
  onOpenChange,
  taskId,
  typeTitle,
  preview,
  confirmed,
  pending,
  error,
  onConfirm,
  onCancelTask,
  onRemoveTask,
}: StartTaskDialogProps) {
  const { t } = useTranslation();
  const dismissRef = useRef<HTMLButtonElement>(null);
  const code = error ? workflowRefusalOf(error).code : undefined;
  const changed = code === 'WORKFLOW_DEFINITION_CHANGED' && confirmed !== undefined;
  const typeNotAllowed = code === 'WORKFLOW_TASK_TYPE_NOT_ALLOWED';

  // A refusal moves focus to the harmless dismiss, never to a consequential action.
  useEffect(() => {
    if (open && code) {
      dismissRef.current?.focus();
    }
  }, [open, code]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('workflowExecution.start.title', { id: taskId })}</DialogTitle>
          <DialogDescription>
            {typeNotAllowed
              ? t('workflowExecution.start.cannotStart')
              : t('workflowExecution.start.description', { version: preview.version })}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-5">
          {changed ? (
            <Alert role="alert" tone="attention" title={t('workflowExecution.start.changedTitle')}>
              {t('workflowExecution.start.changedBody', {
                confirmed: confirmed.version,
                title: preview.title,
                version: preview.version,
              })}
            </Alert>
          ) : typeNotAllowed ? (
            <Alert
              role="alert"
              tone="danger"
              title={t('workflowExecution.start.typeNotAllowedTitle', { type: typeTitle })}
            >
              {t('workflowExecution.start.typeNotAllowedBody', { type: typeTitle })}
            </Alert>
          ) : error ? (
            <WorkflowRefusalAlert error={error} />
          ) : null}
          <DescriptionList>
            <DescriptionList.Item>
              <DescriptionList.Term>{t('workflowExecution.start.taskType')}</DescriptionList.Term>
              <DescriptionList.Detail>{typeTitle}</DescriptionList.Detail>
            </DescriptionList.Item>
            <DescriptionList.Item>
              <DescriptionList.Term>{t('workflowExecution.start.workflow')}</DescriptionList.Term>
              <DescriptionList.Detail>
                {changed && confirmed.version !== preview.version
                  ? t('workflowExecution.start.workflowChanged', {
                      title: preview.title,
                      from: confirmed.version,
                      to: preview.version,
                    })
                  : t('workflowExecution.now.workflow', {
                      title: preview.title,
                      version: preview.version,
                    })}
              </DescriptionList.Detail>
            </DescriptionList.Item>
            {typeNotAllowed ? null : (
              <DescriptionList.Item>
                <DescriptionList.Term>
                  {t('workflowExecution.start.firstStep')}
                </DescriptionList.Term>
                <DescriptionList.Detail>
                  <span title={preview.firstStep}>{preview.firstStepTitle}</span>
                </DescriptionList.Detail>
              </DescriptionList.Item>
            )}
          </DescriptionList>
        </DialogBody>
        <DialogFooter>
          <Button ref={dismissRef} variant="secondary" onClick={() => onOpenChange(false)}>
            {typeNotAllowed ? t('workflowExecution.start.notNow') : t('common.cancel')}
          </Button>
          {typeNotAllowed ? (
            <>
              {onCancelTask ? (
                <Button variant="secondary" onClick={onCancelTask}>
                  {t('taskAuthoring.lifecycle.cancel')}
                </Button>
              ) : null}
              {onRemoveTask ? (
                <Button variant="destructive" onClick={onRemoveTask}>
                  {t('taskAuthoring.lifecycle.remove')}
                </Button>
              ) : null}
            </>
          ) : (
            <Button onClick={onConfirm} disabled={pending}>
              {changed
                ? t('workflowExecution.start.startWithVersion', { version: preview.version })
                : t('workflowExecution.start.confirm', { step: preview.firstStepTitle })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
