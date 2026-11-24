import { createContext, useContext, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import type { WorkspaceHeaderAction } from '@nevo/ui';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { useApplicationCollection } from '../../../../app/navigation/ApplicationLocation';
import { useRuntimeMode } from '../../../../app/useRuntimeMode';
import { useSpecificationWorkspace } from '../../../specs/read-model';
import { NewTaskDialog } from '../../authoring/NewTaskDialog';
import { useSpecificationActions } from '../../read-model';
import { goToHeading } from '../InlineAction';
import { AbandonSpecificationDialog } from './AbandonSpecificationDialog';
import type { BlockerTask } from './BlockerGroups';
import { CloseSpecificationDialog } from './CloseSpecificationDialog';
import { TaskAttentionHost } from '../../overview/TaskAttentionHost';

type ExitDialog = 'close' | 'abandon';
type WorkflowDialog = ExitDialog | 'new-task';

interface SpecificationWorkflowValue {
  readonly specId: string;
  readonly projection: WorkflowActionProjection | undefined;
  /** The last read of the projection failed (kept `projection` is then the last one read). */
  readonly readFailed: boolean;
  readonly retryRead: () => void;
  readonly retrying: boolean;
  readonly openExit: (dialog: ExitDialog) => void;
  /** Opens the Tasks page (`/specs/:specId/tasks`). */
  readonly openTasks: () => void;
  /** Opens New task; absent while the projection does not allow creating a Task. */
  readonly openNewTask?: () => void;
}

const SpecificationWorkflowContext = createContext<SpecificationWorkflowValue | null>(null);

export const SPECIFICATION_NOW_HEADING = 'spec-workflow-heading';

/**
 * The Specification's workflow for its Overview: the projection, the Close and Abandon dialogs
 * that the header overflow and the Now block both open, and the New task dialog Now opens, in every Runtime (the demo runs the same
 * Engine workflow in memory). Only a current (not archived) Specification can still move; an
 * archived one gets nothing and its Overview stays as it was.
 */
export function SpecificationWorkflowProvider({
  specId,
  children,
}: {
  readonly specId: string;
  readonly children: ReactNode;
}) {
  const collection = useApplicationCollection();
  // Either Runtime serves the workflow; only a harness without a connected Runtime has none.
  const runtimeMode = useRuntimeMode();
  const connected = runtimeMode === 'project' || runtimeMode === 'demo';

  return connected && collection === 'current' ? (
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const collection = useApplicationCollection();
  const actions = useSpecificationActions(specId);
  const projection = actions.data;
  const workspace = useSpecificationWorkspace(specId).data;
  const [dialog, setDialog] = useState<WorkflowDialog>();
  const all = (workspace?.taskGroups ?? []).flatMap((group) => group.tasks);
  const asBlocker = (task: (typeof all)[number]): BlockerTask => ({
    id: task.id,
    title: task.title,
    state: task.statusId
      ? t(`taskAuthoring.status.${task.statusId}`, { defaultValue: task.status })
      : task.status,
    ...(task.statusId ? { statusId: task.statusId } : {}),
  });
  const tasks = new Map(all.map((task) => [task.id, asBlocker(task)]));
  const openTask = (taskId: string) =>
    void navigate({
      to: '/specs/$specId/tasks/$taskId',
      params: { specId, taskId },
      search: { collection },
    });
  const close = () => setDialog(undefined);
  const openTasks = () =>
    void navigate({ to: '/specs/$specId/tasks', params: { specId }, search: { collection } });
  const specTitle = workspace?.title ?? specId;
  const canCreateTask = projection?.specification?.createTask.kind === 'allowed';

  return (
    <SpecificationWorkflowContext.Provider
      value={{
        specId,
        projection,
        readFailed: actions.isError,
        retryRead: () => void actions.refetch(),
        retrying: actions.isFetching,
        openExit: setDialog,
        openTasks,
        ...(canCreateTask ? { openNewTask: () => setDialog('new-task') } : {}),
      }}
    >
      {children}
      <TaskAttentionHost
        specId={specId}
        typeTitle={(taskId) => all.find((task) => task.id === taskId)?.typeTitle}
      />
      {projection ? (
        <>
          {projection.specification ? (
            <NewTaskDialog
              specId={specId}
              specTitle={specTitle}
              open={dialog === 'new-task'}
              onOpenChange={(open) => !open && close()}
              taskTypes={projection.specification.taskTypes}
              tasks={all.map((task) => ({ id: task.id, title: task.title }))}
            />
          ) : null}
          <CloseSpecificationDialog
            open={dialog === 'close'}
            onOpenChange={(open) => !open && close()}
            specId={specId}
            specTitle={specTitle}
            projection={projection}
            tasks={tasks}
            {...(workspace?.taskProgress ? { progress: workspace.taskProgress } : {})}
            documents={workspace?.documents ?? []}
            {...(projection.specification?.exit?.abandon.kind === 'allowed' ||
            projection.specification?.exit?.abandon.kind === 'blocked'
              ? { onAbandonInstead: () => setDialog('abandon') }
              : {})}
            onSeeWorkflow={() => goToHeading(SPECIFICATION_NOW_HEADING)}
            onSeeTasks={() => {
              close();
              openTasks();
            }}
            onOpenTask={openTask}
            onOpenSpecification={(id) =>
              void navigate({
                to: '/specs/$specId',
                params: { specId: id },
                search: { collection: 'current' },
              })
            }
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

  // A Runtime without a repository (the demo) cannot close: the menu says so instead of a dialog
  // that would fail.
  const actions: WorkspaceHeaderAction[] = [
    exit.close.kind === 'unavailable'
      ? {
          id: 'close-specification',
          label: t('workflowExecution.close.noRepository'),
          disabled: true,
          onPress: () => undefined,
        }
      : {
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
