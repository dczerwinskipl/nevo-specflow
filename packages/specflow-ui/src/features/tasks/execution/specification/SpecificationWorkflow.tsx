import { createContext, useContext, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import type { WorkspaceHeaderAction } from '@nevo/ui';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { useApplicationCollection } from '../../../../app/navigation/ApplicationLocation';
import { useRuntimeMode } from '../../../../app/useRuntimeMode';
import { useSpecificationWorkspace } from '../../../specs/read-model';
import { useSpecificationActions } from '../../authoring/useTaskAuthoring';
import { goToHeading } from '../InlineAction';
import { AbandonSpecificationDialog } from './AbandonSpecificationDialog';
import type { BlockerTask } from './BlockerGroups';
import { CloseSpecificationDialog } from './CloseSpecificationDialog';

type ExitDialog = 'close' | 'abandon';

interface SpecificationWorkflowValue {
  readonly specId: string;
  readonly projection: WorkflowActionProjection | undefined;
  readonly openExit: (dialog: ExitDialog) => void;
}

const SpecificationWorkflowContext = createContext<SpecificationWorkflowValue | null>(null);

export const SPECIFICATION_NOW_HEADING = 'spec-workflow-heading';

/**
 * The Specification's workflow for its Overview: the projection, and the Close and Abandon dialogs
 * that the header overflow and the Now block both open. Only a project Runtime serves workflow
 * routes, and only a current (not archived) Specification can still move; elsewhere it provides
 * nothing and the Overview stays as it was.
 */
export function SpecificationWorkflowProvider({
  specId,
  children,
}: {
  readonly specId: string;
  readonly children: ReactNode;
}) {
  const runtimeMode = useRuntimeMode();
  const collection = useApplicationCollection();
  const enabled = runtimeMode === 'project' && collection === 'current';

  return enabled ? (
    <ProjectSpecificationWorkflow specId={specId}>{children}</ProjectSpecificationWorkflow>
  ) : (
    children
  );
}

function ProjectSpecificationWorkflow({
  specId,
  children,
}: {
  readonly specId: string;
  readonly children: ReactNode;
}) {
  const navigate = useNavigate();
  const collection = useApplicationCollection();
  const projection = useSpecificationActions(specId).data;
  const workspace = useSpecificationWorkspace(specId).data;
  const [dialog, setDialog] = useState<ExitDialog>();
  const all = (workspace?.taskGroups ?? []).flatMap((group) => group.tasks);
  const asBlocker = (task: (typeof all)[number]): BlockerTask => ({
    id: task.id,
    title: task.title,
    state: task.status,
  });
  const tasks = new Map(all.map((task) => [task.id, asBlocker(task)]));
  const openTask = (taskId: string) =>
    void navigate({
      to: '/specs/$specId/tasks/$taskId',
      params: { specId, taskId },
      search: { collection },
    });
  const close = () => setDialog(undefined);
  const specTitle = workspace?.title ?? specId;

  return (
    <SpecificationWorkflowContext.Provider value={{ specId, projection, openExit: setDialog }}>
      {children}
      {projection ? (
        <>
          <CloseSpecificationDialog
            open={dialog === 'close'}
            onOpenChange={(open) => !open && close()}
            specId={specId}
            specTitle={specTitle}
            projection={projection}
            tasks={tasks}
            cancelledTasks={all.filter((task) => task.statusId === 'cancelled').map(asBlocker)}
            {...(projection.specification?.exit?.abandon.kind === 'allowed' ||
            projection.specification?.exit?.abandon.kind === 'blocked'
              ? { onAbandonInstead: () => setDialog('abandon') }
              : {})}
            onSeeWorkflow={() => goToHeading(SPECIFICATION_NOW_HEADING)}
            onSeeTasks={() => goToHeading('tasks-heading')}
            onOpenTask={openTask}
            onClosed={() => void navigate({ to: '/', search: { collection: 'archive' } })}
          />
          <AbandonSpecificationDialog
            open={dialog === 'abandon'}
            onOpenChange={(open) => !open && close()}
            specId={specId}
            specTitle={specTitle}
            projection={projection}
            tasks={tasks}
            unfinishedTasks={all
              .filter(
                (task) => !['cancelled', 'completed', 'abandoned'].includes(task.statusId ?? ''),
              )
              .map(asBlocker)}
            activeTasks={all.filter((task) => task.statusId === 'in-progress').map(asBlocker)}
            onOpenTask={openTask}
          />
        </>
      ) : null}
    </SpecificationWorkflowContext.Provider>
  );
}

/** The Specification's workflow on its Overview, when it has one (project Runtime, current). */
export function useSpecificationWorkflow(): SpecificationWorkflowValue | null {
  return useContext(SpecificationWorkflowContext);
}

/**
 * Whether the Overview shows the Specification's Now block in its preparation block's place: a
 * project Runtime, a current Specification and a bound workflow (while the projection loads, the
 * place stays reserved and empty rather than flashing the preparation block).
 */
export function useSpecificationNowVisible(): boolean {
  const workflow = useSpecificationWorkflow();
  const projection = workflow?.projection;
  if (!workflow) {
    return false;
  }

  return !(
    projection &&
    !projection.workflow &&
    projection.position.kind === 'blocked' &&
    projection.position.blockers.some((blocker) => blocker.kind === 'not-configured')
  );
}

/**
 * The Overview header's overflow actions: Close specification (it opens the Close preflight) and,
 * when the projection allows it, Abandon specification (danger).
 */
export function useSpecificationExitActions(): WorkspaceHeaderAction[] {
  const { t } = useTranslation();
  const workflow = useSpecificationWorkflow();
  const exit = workflow?.projection?.specification?.exit;
  if (!workflow || !exit) {
    return [];
  }

  const actions: WorkspaceHeaderAction[] = [
    {
      id: 'close-specification',
      label: t('workflowExecution.close.action'),
      onPress: () => workflow.openExit('close'),
    },
  ];
  if (exit.abandon.kind !== 'unavailable') {
    actions.push({
      id: 'abandon-specification',
      label: t('workflowExecution.abandon.action'),
      tone: 'danger',
      onPress: () => workflow.openExit('abandon'),
    });
  }

  return actions;
}
