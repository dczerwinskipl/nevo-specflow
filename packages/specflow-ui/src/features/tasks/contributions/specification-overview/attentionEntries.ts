import type {
  SpecificationAttentionAction,
  SpecificationAttentionEntry,
  SpecificationWorkSectionContext,
} from '../../../specs';
import type { AttentionItem, SpecificationWorkspaceData } from '../../../specs/read-model';
import { message } from '../../../../i18n/message';
import { requestTaskAttention } from '../../overview/attentionRequests';

type ActionCode = NonNullable<AttentionItem['action']>;
type Context = Pick<SpecificationWorkSectionContext, 'specId' | 'actions'>;

/**
 * The flow each attention action maps to, on the Overview. The UI decides nothing about legality:
 * the item names the action, and the flow behind it is the one the Task or Specification page
 * already offers (its Now block, its dialogs, its sections). Actions without a UI of their own yet
 * (project settings, archetype configuration) are shown, unavailable.
 */
function actionOf(
  code: ActionCode,
  item: AttentionItem,
  { specId, actions }: Context,
): SpecificationAttentionAction | undefined {
  if (code === 'answer-session') {
    // A Session's item belongs to the Sessions owner.
    return undefined;
  }

  const label = message(`taskOverview.attention.action.${code}`);
  const taskId = item.kind === 'task' ? item.targetId : undefined;
  const onTask = (run: (id: string) => void) =>
    taskId ? { label, onClick: () => run(taskId) } : undefined;
  const openTask = (id: string) => actions.openTask(id);

  switch (code) {
    case 'review-tasks':
      return { label, onClick: () => actions.openTasks({ blocking: 'specification' }) };
    case 'edit-context':
      return onTask((id) => actions.openTask(id, 'context'));
    case 'edit-dependencies':
      return onTask((id) => actions.openTask(id, 'dependencies'));
    case 'confirm-definition':
      return onTask((id) => requestTaskAttention(specId, { kind: 'first-start', taskId: id }));
    case 'cancel-task':
      return onTask((id) => requestTaskAttention(specId, { kind: 'cancel-task', taskId: id }));
    case 'start-step':
      return onTask((id) => requestTaskAttention(specId, { kind: 'start-step', taskId: id }));
    case 'restore-task':
    case 'satisfy-gate':
      return onTask(openTask);
    case 'return-to-step':
      // The Specification's own Return dialog (its Now block); a Task's on the Task page.
      return taskId
        ? { label, onClick: () => openTask(taskId) }
        : { label, onClick: () => requestTaskAttention(specId, { kind: 'return-to-step' }) };
    case 'open-project-settings':
    case 'configure-archetype':
      return {
        label,
        onClick: () => undefined,
        disabled: true,
        disabledTitleKey: 'common.notImplemented',
      };
  }
}

/** The Task type title of a listed Task, for the item's facts. */
function typeTitleOf(data: SpecificationWorkspaceData, taskId: string): string | undefined {
  for (const group of data.taskGroups) {
    const task = group.tasks.find((candidate) => candidate.id === taskId);
    if (task) {
      return task.typeTitle;
    }
  }

  return undefined;
}

/**
 * One workflow attention item on the Overview: what it is about (`T-07 · Backend`, Specification),
 * its reason in the attention tone (danger for a broken Task) and its action. `tasks-stuck` states
 * the intervention ("Resolve 2 blocking tasks"); Now carries the diagnosis and the Task links.
 */
export function taskAttentionEntry(
  item: AttentionItem,
  context: Context & { readonly data: SpecificationWorkspaceData },
): SpecificationAttentionEntry {
  const broken = item.code === 'task-broken';
  const stuck = item.code === 'tasks-stuck' && (item.taskIds?.length ?? 0) > 0;
  const typeTitle =
    item.kind === 'task' && item.targetId ? typeTitleOf(context.data, item.targetId) : undefined;
  // An item without a workflow action (the demo Runtime's) previews its Task.
  const action = item.action
    ? actionOf(item.action, item, context)
    : item.targetId
      ? {
          label: message('specification.attentionViewTask'),
          onClick: () => context.actions.previewTask(item.targetId!),
        }
      : undefined;
  const secondaryAction = item.secondaryAction
    ? actionOf(item.secondaryAction, item, context)
    : undefined;

  return {
    item,
    icon: 'list-checks',
    facts:
      item.kind === 'task' && item.targetId
        ? [item.targetId, ...(typeTitle ? [typeTitle] : [])]
        : [message('taskOverview.attention.specification')],
    ...(stuck
      ? {
          title: message('taskOverview.attention.stuckTitle', { count: item.taskIds!.length }),
          reason: message('taskOverview.attention.stuckReason'),
        }
      : {}),
    tone: broken ? 'danger' : 'attention',
    reasonIcon: broken ? 'circle-alert' : 'triangle-alert',
    ...(action ? { action } : {}),
    ...(secondaryAction ? { secondaryAction } : {}),
  };
}
