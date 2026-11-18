import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Typography } from '@nevo/ui';
import type { CloseRefusalBlocker } from '@nevo/specflow-contracts/specs';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { SemanticSupportingLine } from '../../../../shared/operational-list';
import { taskStatusSupporting } from '../../read-model/statusPresentation';
import { InlineAction } from '../InlineAction';

export const ITEMS_SHOWN = 5;

type Group = 'sessions' | 'workflow' | 'tasks' | 'broken' | 'writes' | 'state';

/** Which group each blocker kind belongs to; the group order is fixed. */
const GROUP_OF: Record<CloseRefusalBlocker['kind'], Group> = {
  'specification-run': 'workflow',
  'draft-tasks': 'tasks',
  'on-hold-tasks': 'tasks',
  'unfinished-tasks': 'tasks',
  'broken-tasks': 'broken',
  'pending-execution-change': 'writes',
  'pending-task-documents': 'writes',
  'operation-in-progress': 'writes',
  'execution-state-unreadable': 'state',
  'session-turn-running': 'sessions',
};

/** Close: Workflow → Unfinished tasks → Pending writes; Abandon starts with Pending writes. */
const CLOSE_ORDER: readonly Group[] = [
  'sessions',
  'workflow',
  'tasks',
  'broken',
  'writes',
  'state',
];
const ABANDON_ORDER: readonly Group[] = [
  'writes',
  'state',
  'sessions',
  'workflow',
  'tasks',
  'broken',
];

const taskIdsOf = (
  blockers: readonly CloseRefusalBlocker[],
  group: Group,
  tasks: ReadonlyMap<string, BlockerTask>,
) => [
  ...new Set(
    blockers
      .filter((blocker) => GROUP_OF[blocker.kind] === group)
      .flatMap((blocker) => blocker.subjectIds)
      .filter((id) => tasks.has(id)),
  ),
];

/** Where the Specification's workflow stands: its current step, and whether it waits for Tasks. */
export interface WorkflowAt {
  readonly stepTitle?: string;
  readonly waiting: boolean;
}

export function workflowAtOf(position: WorkflowActionProjection['position']): WorkflowAt {
  switch (position.kind) {
    case 'waiting':
      return { stepTitle: position.step.title, waiting: true };
    case 'active':
      return { stepTitle: position.step.title, waiting: false };
    case 'ready':
      return { stepTitle: position.next.step.title, waiting: false };
    default:
      return { waiting: false };
  }
}

/**
 * Why a Specification cannot close, as one list of clauses with counts ("its workflow is waiting
 * for 4 unfinished tasks and 1 task document is still being saved"). The workflow waits for Tasks
 * only on its wait step; on any other step it is "still at" that step and the unfinished Tasks are
 * a clause of their own.
 */
export function closeReasons(
  t: TFunction,
  locale: string,
  blockers: readonly CloseRefusalBlocker[],
  tasks: ReadonlyMap<string, BlockerTask>,
  at: WorkflowAt = { waiting: false },
): string {
  const has = (group: Group) => blockers.some((blocker) => GROUP_OF[blocker.kind] === group);
  const unfinished = taskIdsOf(blockers, 'tasks', tasks).length;
  const reasons: string[] = [];
  if (has('sessions')) {
    // An agent works in the worktree Close would remove (subjects are Session ids).
    const sessions = blockers
      .filter((blocker) => GROUP_OF[blocker.kind] === 'sessions')
      .reduce((count, blocker) => count + blocker.subjectIds.length, 0);
    reasons.push(t('workflowExecution.close.reason.sessions', { count: sessions }));
  }

  if (has('workflow') && at.waiting && unfinished > 0) {
    reasons.push(t('workflowExecution.close.reason.waiting', { count: unfinished }));
  } else {
    if (has('workflow')) {
      reasons.push(
        at.stepTitle !== undefined
          ? t('workflowExecution.close.reason.atStep', { step: at.stepTitle })
          : t('workflowExecution.close.reason.workflow'),
      );
    }

    if (unfinished > 0) {
      reasons.push(t('workflowExecution.close.reason.unfinished', { count: unfinished }));
    }
  }

  if (has('broken')) {
    reasons.push(
      t('workflowExecution.close.reason.broken', {
        count: taskIdsOf(blockers, 'broken', tasks).length,
      }),
    );
  }

  if (has('writes')) {
    const saving = taskIdsOf(blockers, 'writes', tasks).length;
    reasons.push(
      saving > 0
        ? t('workflowExecution.close.reason.saving', { count: saving })
        : t('workflowExecution.close.reason.change'),
    );
  }

  if (has('state')) {
    reasons.push(t('workflowExecution.close.reason.state'));
  }

  return new Intl.ListFormat(locale, { type: 'conjunction' }).format(reasons);
}

export interface BlockerTask {
  readonly id: string;
  readonly title: string;
  /** The status label. */
  readonly state: string;
  /** The presented status id, for the status mark (`getTaskStatePresentation`). */
  readonly statusId?: string;
  /** Why an On hold Task is held (the Tasks page row's supporting line). */
  readonly holdReason?: string;
}

export interface BlockerGroupsProps {
  readonly blockers: readonly CloseRefusalBlocker[];
  readonly order: 'close' | 'abandon';
  /** The Specification's Tasks by id, to name each blocking Task and its state. */
  readonly tasks: ReadonlyMap<string, BlockerTask>;
  readonly onOpenTask: (taskId: string) => void;
  readonly onSeeWorkflow?: () => void;
  readonly onSeeTasks?: () => void;
  /** Where the workflow stands, to explain the Workflow group; a generic explanation without it. */
  readonly workflowAt?: WorkflowAt;
}

/**
 * What keeps a Specification from ending, grouped in a fixed order: each group with one
 * explanation, at most five Tasks (then "and N more"; the heading counts them) with a link and their
 * status, and its resolving action.
 */
export function BlockerGroups({
  blockers,
  order,
  tasks,
  onOpenTask,
  onSeeWorkflow,
  onSeeTasks,
  workflowAt,
}: BlockerGroupsProps) {
  const { t } = useTranslation();
  const groups = (order === 'close' ? CLOSE_ORDER : ABANDON_ORDER).flatMap((group) => {
    const members = blockers.filter((blocker) => GROUP_OF[blocker.kind] === group);
    if (members.length === 0) {
      return [];
    }

    return [{ group, taskIds: taskIdsOf(blockers, group, tasks) }];
  });

  return (
    <div className="grid gap-5">
      {groups.map(({ group, taskIds }) => {
        const title = t(`workflowExecution.exit.group.${group}`);
        const shown = taskIds.slice(0, ITEMS_SHOWN);
        const more = taskIds.length - shown.length;
        const action =
          group === 'workflow' && onSeeWorkflow
            ? { label: t('workflowExecution.exit.seeWorkflow'), onSelect: onSeeWorkflow }
            : (group === 'tasks' || group === 'broken') && onSeeTasks
              ? { label: t('workflowExecution.exit.goToTasks'), onSelect: onSeeTasks }
              : undefined;

        return (
          <section key={group} className="grid gap-2" aria-label={title}>
            <div className="grid gap-0.5">
              <Typography as="h3" variant="label-sm">
                {/* Only a group that lists its Tasks counts them. */}
                {taskIds.length > 0
                  ? t('workflowExecution.exit.groupHeading', { title, count: taskIds.length })
                  : title}
              </Typography>
              <Typography as="p" variant="body-sm" className="text-content-secondary">
                {group === 'workflow' && workflowAt?.stepTitle !== undefined && !workflowAt.waiting
                  ? t('workflowExecution.exit.explanation.workflowAtStep', {
                      step: workflowAt.stepTitle,
                    })
                  : t(`workflowExecution.exit.explanation.${group}`)}
              </Typography>
            </div>
            {shown.length > 0 ? (
              <ul className="grid gap-2">
                {shown.map((id) => {
                  const task = tasks.get(id);

                  return (
                    <li key={id} className="grid min-w-0 gap-0.5 text-body-sm" data-task-id={id}>
                      {/* As on a Task row: the title, then the id on its own secondary line. */}
                      <span className="min-w-0 [overflow-wrap:anywhere]">
                        <InlineAction className="font-normal" onClick={() => onOpenTask(id)}>
                          {task?.title ?? id}
                        </InlineAction>
                      </span>
                      {task?.title ? (
                        <span
                          className="min-w-0 font-mono text-content-muted [overflow-wrap:anywhere]"
                          data-task-identity=""
                        >
                          {id}
                        </span>
                      ) : null}
                      {/* A pending write names what is being saved, not the status of the Task. */}
                      {group === 'writes' ? (
                        <span className="text-content-muted">
                          {t('workflowExecution.exit.saving')}
                        </span>
                      ) : task ? (
                        <SemanticSupportingLine
                          line={taskStatusSupporting(task.statusId, task.state)}
                        />
                      ) : null}
                      {group !== 'writes' && task?.statusId === 'on-hold' && task.holdReason ? (
                        <span className="text-content-secondary">{task.holdReason}</span>
                      ) : null}
                    </li>
                  );
                })}
                {more > 0 && onSeeTasks ? (
                  <li className="text-body-sm">
                    <InlineAction onClick={onSeeTasks}>
                      {t('workflowExecution.exit.more', { count: more })}
                    </InlineAction>
                  </li>
                ) : null}
              </ul>
            ) : null}
            {action ? (
              <div className="text-body-sm">
                <InlineAction onClick={action.onSelect}>{action.label}</InlineAction>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
