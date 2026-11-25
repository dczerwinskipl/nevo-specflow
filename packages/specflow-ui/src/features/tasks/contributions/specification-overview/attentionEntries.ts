import type {
  SpecificationAttentionAction,
  SpecificationAttentionEntry,
  SpecificationWorkSectionContext,
} from '../../../specs';
import type { AttentionItem, SpecificationWorkspaceData } from '../../../specs/read-model';
import { message } from '../../../../i18n/message';
import {
  attentionActionHasFlow,
  attentionActionLabel,
  attentionReason,
  attentionStuckTitle,
} from '../../overview/attentionWording';
import { goToHeading } from '../../execution/InlineAction';
import { SPECIFICATION_NOW_HEADING } from '../../execution/specification/SpecificationWorkflow';
import {
  requestTaskAttention,
  taskCommandKey,
  type TaskAttentionRequest,
} from '../../overview/attentionRequests';

type ActionCode = NonNullable<AttentionItem['action']>;
type Context = Pick<SpecificationWorkSectionContext, 'specId' | 'actions'>;

/**
 * The flow each attention action maps to, on the Overview. The UI decides nothing about legality:
 * the item names the action, and the flow behind it is the one the Task or Specification page
 * already offers (its Now block, its dialogs, its sections). Actions without a UI of their own yet
 * (project settings, archetype configuration) have no button: the reason says what is needed.
 * A flow handed to the Overview that nobody takes yet (its owner still loading) falls back to the
 * page that offers it, so a click never does nothing.
 */
function actionOf(
  code: ActionCode,
  item: AttentionItem,
  { specId, actions }: Context,
): SpecificationAttentionAction | undefined {
  if (!attentionActionHasFlow(code)) {
    // A Session's item belongs to the Sessions owner; settings have no UI yet.
    return undefined;
  }

  const label = attentionActionLabel(code, item);
  const taskId = item.kind === 'task' ? item.targetId : undefined;
  const onTask = (run: (id: string) => void) =>
    taskId ? { label, onClick: () => run(taskId) } : undefined;
  const openTask = (id: string) => actions.openTask(id);
  const handOver = (request: TaskAttentionRequest, fallback: () => void) => () => {
    if (!requestTaskAttention(specId, request)) {
      fallback();
    }
  };

  switch (code) {
    case 'review-tasks':
      return { label, onClick: () => actions.openTasks({ blocking: 'specification' }) };
    case 'edit-context':
      return onTask((id) => actions.openTask(id, 'context'));
    case 'edit-dependencies':
      return onTask((id) => actions.openTask(id, 'dependencies'));
    case 'confirm-definition':
    case 'cancel-task':
    case 'resume-task':
    case 'start-step': {
      const kind = code === 'confirm-definition' ? 'first-start' : code;

      return taskId
        ? {
            label,
            onClick: handOver({ kind, taskId }, () => openTask(taskId)),
            // A direct command shows busy while it runs (the Overview's Tasks flows mark it).
            ...(kind === 'start-step' || kind === 'resume-task'
              ? { pendingKey: taskCommandKey(specId, kind, taskId) }
              : {}),
          }
        : undefined;
    }

    // Restoring files and satisfying a gate happen on the Task page.
    case 'restore-task':
    case 'satisfy-gate':
      return onTask(openTask);
    case 'reevaluate-wait':
      return { label, onClick: () => goToHeading(SPECIFICATION_NOW_HEADING) };
    // An agent's result that waits for the owner is decided where its step is shown.
    case 'confirm-result':
    case 'reject-result':
      return taskId
        ? { label, onClick: () => openTask(taskId) }
        : { label, onClick: () => goToHeading(SPECIFICATION_NOW_HEADING) };
    case 'return-to-step':
      // The Specification's own Return dialog (its Now block, which also offers it in its menu
      // while it loads); a Task's on the Task page.
      return taskId
        ? { label, onClick: () => openTask(taskId) }
        : {
            label,
            onClick: handOver({ kind: 'return-to-step' }, () =>
              goToHeading(SPECIFICATION_NOW_HEADING),
            ),
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
  const factsReason = attentionReason(item, context.data.taskOverview?.taskTitles);
  const stuckTitle = attentionStuckTitle(item);
  const typeTitle =
    item.kind === 'task' && item.targetId ? typeTitleOf(context.data, item.targetId) : undefined;
  // An item without a workflow action opens its Task.
  const primary = item.action
    ? actionOf(item.action, item, context)
    : item.targetId
      ? {
          label: message('specification.attentionViewTask'),
          onClick: () => context.actions.openTask(item.targetId!),
        }
      : undefined;
  const alternative = item.secondaryAction
    ? actionOf(item.secondaryAction, item, context)
    : undefined;
  // Without a flow for the main action (project settings), its alternative (Cancel task) is the
  // one action; with neither, the reason stands alone.
  const action = primary ?? alternative;
  const secondaryAction = primary ? alternative : undefined;

  return {
    item,
    icon: 'list-checks',
    // The Task's key is left to the Tasks page; its title is the item's title already.
    facts:
      item.kind === 'task' && item.targetId
        ? typeTitle
          ? [typeTitle]
          : []
        : [message('taskOverview.attention.specification')],
    ...(stuckTitle
      ? { title: stuckTitle, reason: message('taskOverview.attention.stuckReason') }
      : {}),
    ...(factsReason ? { reason: factsReason } : {}),
    tone: broken ? 'danger' : 'attention',
    reasonIcon: broken ? 'circle-alert' : 'triangle-alert',
    ...(action ? { action } : {}),
    ...(secondaryAction ? { secondaryAction } : {}),
  };
}
