import { useTranslation } from 'react-i18next';
import { Typography } from '@nevo/ui';
import type { ExitBlocker } from '@nevo/specflow-contracts/workflow';
import { InlineAction } from '../InlineAction';

const ITEMS_SHOWN = 5;

type Group = 'workflow' | 'tasks' | 'broken' | 'writes' | 'state';

/** Which group each blocker kind belongs to; the group order is fixed. */
const GROUP_OF: Record<ExitBlocker['kind'], Group> = {
  'specification-run': 'workflow',
  'draft-tasks': 'tasks',
  'on-hold-tasks': 'tasks',
  'unfinished-tasks': 'tasks',
  'broken-tasks': 'broken',
  'pending-execution-change': 'writes',
  'pending-task-documents': 'writes',
  'operation-in-progress': 'writes',
  'execution-state-unreadable': 'state',
};

/** Close: Workflow → Unfinished tasks → Pending writes; Abandon starts with Pending writes. */
const CLOSE_ORDER: readonly Group[] = ['workflow', 'tasks', 'broken', 'writes', 'state'];
const ABANDON_ORDER: readonly Group[] = ['writes', 'state', 'workflow', 'tasks', 'broken'];

export interface BlockerTask {
  readonly id: string;
  readonly title: string;
  readonly state: string;
}

export interface BlockerGroupsProps {
  readonly blockers: readonly ExitBlocker[];
  readonly order: 'close' | 'abandon';
  /** The Specification's Tasks by id, to name each blocking Task and its state. */
  readonly tasks: ReadonlyMap<string, BlockerTask>;
  readonly onOpenTask: (taskId: string) => void;
  readonly onSeeWorkflow?: () => void;
  readonly onSeeTasks?: () => void;
}

/**
 * What keeps a Specification from ending, grouped in a fixed order: each group with its count, one
 * explanation, at most five linked Tasks (then "and N more") and its resolving action.
 */
export function BlockerGroups({
  blockers,
  order,
  tasks,
  onOpenTask,
  onSeeWorkflow,
  onSeeTasks,
}: BlockerGroupsProps) {
  const { t } = useTranslation();
  const groups = (order === 'close' ? CLOSE_ORDER : ABANDON_ORDER).flatMap((group) => {
    const members = blockers.filter((blocker) => GROUP_OF[blocker.kind] === group);
    if (members.length === 0) {
      return [];
    }

    const taskIds = [...new Set(members.flatMap((blocker) => blocker.subjectIds))].filter((id) =>
      tasks.has(id),
    );

    return [{ group, members, taskIds }];
  });

  return (
    <div className="grid gap-5">
      {groups.map(({ group, members, taskIds }) => {
        const title = t(`workflowExecution.exit.group.${group}`);
        const count = taskIds.length > 0 ? taskIds.length : members.length;
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
                {t('workflowExecution.exit.groupHeading', { title, count })}
              </Typography>
              <Typography as="p" variant="body-sm" className="text-content-secondary">
                {t(`workflowExecution.exit.explanation.${group}`)}
              </Typography>
            </div>
            {shown.length > 0 ? (
              <ul className="grid gap-2">
                {shown.map((id) => {
                  const task = tasks.get(id);

                  return (
                    <li key={id} className="grid min-w-0 text-body-sm">
                      <InlineAction
                        className="min-w-0 font-normal text-content-primary [overflow-wrap:anywhere]"
                        onClick={() => onOpenTask(id)}
                      >
                        <span className="font-mono text-content-muted">{id}</span>{' '}
                        {task?.title ?? id}
                      </InlineAction>
                      {task?.state ? (
                        <span className="text-content-muted">{task.state}</span>
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
