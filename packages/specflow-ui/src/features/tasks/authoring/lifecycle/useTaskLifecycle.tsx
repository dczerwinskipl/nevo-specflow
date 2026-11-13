import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { WorkspaceHeaderAction } from '@nevo/ui';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { useTaskCommands } from '../useTaskAuthoring';
import { LifecycleDialog, type LifecycleDecision } from './LifecycleDialog';

type Lifecycle = NonNullable<WorkflowActionProjection['task']>;

export interface UseTaskLifecycleInput {
  readonly specId: string;
  readonly taskId: string;
  /** The manifest revision a removal names (`resource.revision`). */
  readonly revision: string;
  readonly lifecycle: Lifecycle | undefined;
  /** Names of the required context entries that do not resolve (the Approve warning). */
  readonly missingContext: readonly string[];
  readonly onEditDetails: () => void;
  readonly onRemoved: () => void;
}

/**
 * The Task's lifecycle actions as header actions, each offered only when the projection allows
 * it (Put on hold during an active attempt stays, disabled). Approve confirms only when a required
 * context entry is missing; Resume acts directly; Hold, Cancel and Remove confirm.
 *
 * Approve and Resume are the subject's primary actions and move to the Now block with T11.
 */
export function useTaskLifecycle(input: UseTaskLifecycleInput): {
  readonly actions: WorkspaceHeaderAction[];
  readonly dialogs: ReactNode;
  /** A refusal of an action that did not open a dialog (Approve without warning, Resume). */
  readonly directError: unknown;
} {
  const { t } = useTranslation();
  const commands = useTaskCommands(input.specId, input.taskId);
  const [decision, setDecision] = useState<LifecycleDecision>();
  const [directError, setDirectError] = useState<unknown>();
  const lifecycle = input.lifecycle;
  const allowed = (action: keyof Omit<Lifecycle, 'revision'>) =>
    lifecycle?.[action].kind === 'allowed';
  const busy = commands.setStatus.isPending || commands.remove.isPending;

  const setReady = () => {
    setDirectError(undefined);
    commands.setStatus.mutate({ status: 'ready' }, { onError: setDirectError });
  };

  const actions: WorkspaceHeaderAction[] = [];
  if (allowed('approve')) {
    actions.push({
      id: 'approve',
      label: t('taskAuthoring.lifecycle.approve'),
      busy,
      onPress: () => (input.missingContext.length > 0 ? setDecision('approve') : setReady()),
    });
  }

  if (allowed('resume')) {
    actions.push({
      id: 'resume',
      label: t('taskAuthoring.lifecycle.resume'),
      busy,
      onPress: setReady,
    });
  }

  if (allowed('editDetails')) {
    actions.push({
      id: 'edit-details',
      label: t('taskAuthoring.lifecycle.editDetails'),
      onPress: input.onEditDetails,
    });
  }

  const hold = lifecycle?.hold;
  if (
    hold?.kind === 'allowed' ||
    (hold?.kind === 'unavailable' && hold.reason === 'active-attempt')
  ) {
    actions.push({
      id: 'hold',
      label: t('taskAuthoring.lifecycle.hold'),
      disabled: hold.kind !== 'allowed',
      busy,
      onPress: () => setDecision('hold'),
    });
  }

  if (allowed('cancel')) {
    actions.push({
      id: 'cancel',
      label: t('taskAuthoring.lifecycle.cancel'),
      tone: 'danger',
      busy,
      onPress: () => setDecision('cancel'),
    });
  }

  if (allowed('remove')) {
    actions.push({
      id: 'remove',
      label: t('taskAuthoring.lifecycle.remove'),
      tone: 'danger',
      busy,
      onPress: () => setDecision('remove'),
    });
  }

  const close = () => {
    setDecision(undefined);
    commands.setStatus.reset();
    commands.remove.reset();
  };

  const confirm = (reason: string) => {
    const options = { onSuccess: close };
    switch (decision) {
      case 'approve':
        commands.setStatus.mutate({ status: 'ready' }, options);
        break;
      case 'hold':
        commands.setStatus.mutate({ status: 'on-hold', ...(reason ? { reason } : {}) }, options);
        break;
      case 'cancel':
        commands.setStatus.mutate({ status: 'cancelled', ...(reason ? { reason } : {}) }, options);
        break;
      case 'remove':
        commands.remove.mutate(input.revision, { onSuccess: input.onRemoved });
        break;
    }
  };

  return {
    actions,
    directError,
    dialogs: (
      <LifecycleDialog
        taskId={input.taskId}
        decision={decision}
        missingContext={input.missingContext}
        pending={busy}
        error={decision === 'remove' ? commands.remove.error : commands.setStatus.error}
        onConfirm={confirm}
        onClose={close}
      />
    ),
  };
}
