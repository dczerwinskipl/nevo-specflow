import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Navigate } from '@tanstack/react-router';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { useApplicationCollection } from '../../../app/navigation/ApplicationLocation';
import { useAppServices } from '../../../app/useAppServices';
import { useNotify } from '../../../shared/notifications/notifications';
import { LifecycleDialog } from '../authoring/lifecycle/LifecycleDialog';
import { invalidateAfterTaskChange } from '../authoring/queries';
import { useTaskActions, useTaskCommands } from '../authoring/useTaskAuthoring';
import { StartTaskDialog } from '../execution/StartTaskDialog';
import { useWorkflowCommands } from '../execution/useWorkflowCommands';
import { subscribeTaskAttention } from './attentionRequests';

interface Dialog {
  readonly kind: 'first-start' | 'cancel-task';
  readonly taskId: string;
}

function previewOf(position: WorkflowActionProjection['position']) {
  return position.kind === 'not-started' || position.kind === 'blocked'
    ? position.preview
    : undefined;
}

/**
 * The Tasks flows that Requires attention opens on the Overview: the first-start confirmation (a
 * changed workflow revision), the Cancel confirmation, a direct start of a Task's next step and a
 * direct Resume of a Task on hold (`on-hold → ready`, like the Task page's Resume, which also acts
 * without a confirmation). Each is the flow the Task page offers; the item only names which one.
 */
export function TaskAttentionHost({
  specId,
  typeTitle,
}: {
  readonly specId: string;
  /** The Task Type title of a listed Task (the first-start dialog names it). */
  readonly typeTitle: (taskId: string) => string | undefined;
}) {
  const { t } = useTranslation();
  const { workflowExecutionApi, taskAuthoringApi } = useAppServices();
  const queryClient = useQueryClient();
  const notify = useNotify();
  const [dialog, setDialog] = useState<Dialog>();
  // The direct commands in flight, by Task: a repeated click on Start or Resume while its command
  // runs (or its result is still being re-read) is taken and ignored, so no second command is sent.
  // Owned here: added when a command is sent, removed once it settled and the reads refreshed.
  const inFlight = useRef(new Set<string>());
  const settle = async (taskId: string) => {
    try {
      await invalidateAfterTaskChange(queryClient, specId);
    } finally {
      inFlight.current.delete(taskId);
    }
  };

  // A start acts on the Task it was requested for (its id is the mutation's variable).
  const start = useMutation({
    mutationFn: (taskId: string) => workflowExecutionApi.start({ specId, taskId }, {}),
    onError: () => notify(t('taskOverview.attention.startFailed')),
    onSettled: (_result, _error, taskId) => settle(taskId),
  });
  const startStep = start.mutate;
  // A resume acts on the Task it was requested for; the Engine refuses it if it is no longer held.
  const resume = useMutation({
    mutationFn: (taskId: string) => taskAuthoringApi.setStatus(specId, taskId, { status: 'ready' }),
    onError: () => notify(t('taskOverview.attention.resumeFailed')),
    onSettled: (_result, _error, taskId) => settle(taskId),
  });
  const resumeTask = resume.mutate;

  useEffect(
    () =>
      subscribeTaskAttention(specId, (request) => {
        switch (request.kind) {
          case 'start-step':
          case 'resume-task':
            if (!inFlight.current.has(request.taskId)) {
              inFlight.current.add(request.taskId);
              (request.kind === 'start-step' ? startStep : resumeTask)(request.taskId);
            }

            return true;
          case 'first-start':
          case 'cancel-task':
            setDialog({ kind: request.kind, taskId: request.taskId });

            return true;
          default:
            return false;
        }
      }),
    [specId, startStep, resumeTask],
  );

  const close = () => setDialog(undefined);
  if (!dialog) {
    return null;
  }

  return dialog.kind === 'first-start' ? (
    <FirstStart
      key={dialog.taskId}
      specId={specId}
      taskId={dialog.taskId}
      typeTitle={typeTitle(dialog.taskId) ?? dialog.taskId}
      onClose={close}
    />
  ) : (
    <CancelTask key={dialog.taskId} specId={specId} taskId={dialog.taskId} onClose={close} />
  );
}

/** The first-start confirmation of a Task, on the revision its projection previews now. */
function FirstStart({
  specId,
  taskId,
  typeTitle,
  onClose,
}: {
  readonly specId: string;
  readonly taskId: string;
  readonly typeTitle: string;
  readonly onClose: () => void;
}) {
  const collection = useApplicationCollection();
  const projection = useTaskActions(specId, taskId);
  const commands = useWorkflowCommands({ specId, taskId });
  const [confirmed, setConfirmed] = useState<ReturnType<typeof previewOf>>();
  if (!projection.data) {
    return null;
  }

  const preview = previewOf(projection.data.position);
  if (!preview) {
    // Not a first start any more: the Task page shows what is possible now.
    return (
      <Navigate
        to="/specs/$specId/tasks/$taskId"
        params={{ specId, taskId }}
        search={{ collection }}
      />
    );
  }

  return (
    <StartTaskDialog
      open
      onOpenChange={(open) => !open && onClose()}
      taskId={taskId}
      typeTitle={typeTitle}
      preview={preview}
      {...(confirmed ? { confirmed } : {})}
      pending={commands.start.isPending}
      error={commands.start.error}
      onConfirm={() => {
        setConfirmed(preview);
        commands.start.mutate(
          {
            expectedWorkflowRevision:
              projection.data.actions.start?.expectedWorkflowRevision ?? preview.revision,
          },
          { onSuccess: onClose },
        );
      }}
    />
  );
}

/** The Cancel confirmation of a Task (its reason is recorded). */
function CancelTask({
  specId,
  taskId,
  onClose,
}: {
  readonly specId: string;
  readonly taskId: string;
  readonly onClose: () => void;
}) {
  const commands = useTaskCommands(specId, taskId);

  return (
    <LifecycleDialog
      taskId={taskId}
      decision="cancel"
      missingContext={[]}
      pending={commands.setStatus.isPending}
      error={commands.setStatus.error}
      onConfirm={(reason) =>
        commands.setStatus.mutate(
          { status: 'cancelled', ...(reason ? { reason } : {}) },
          { onSuccess: onClose },
        )
      }
      onClose={onClose}
    />
  );
}
