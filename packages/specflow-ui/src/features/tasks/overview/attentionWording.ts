import type { AttentionItem } from '../../specs/read-model';
import { message, type Message } from '../../../i18n/message';

type ActionCode = NonNullable<AttentionItem['action']>;
type WithoutFlow = 'answer-session' | 'open-project-settings' | 'configure-archetype';
/** An action an Overview flow takes (it has a button and a label). */
export type FlowAction = Exclude<ActionCode, WithoutFlow>;

/**
 * The actions no Overview flow takes yet: a Session's item belongs to the Sessions owner, project
 * settings and archetype configuration have no UI. Their item offers no button; its reason says
 * what is needed.
 */
const WITHOUT_FLOW: ReadonlySet<ActionCode> = new Set<WithoutFlow>([
  'answer-session',
  'open-project-settings',
  'configure-archetype',
]);

/** Whether the Overview offers a flow for the action (a button). */
export function attentionActionHasFlow(code: ActionCode): code is FlowAction {
  return !WITHOUT_FLOW.has(code);
}

/** An action's label, one wording: "Start Review the breakdown" for a named step, "Resume". */
export function attentionActionLabel(code: FlowAction, item: AttentionItem): Message {
  return code === 'start-step' && item.stepTitle
    ? message('taskOverview.attention.startNamed', { step: item.stepTitle })
    : message(`taskOverview.attention.action.${code}`);
}

/** Tasks by title (a list the message joins in the reader's language); the key only without one. */
function namedTasks(
  ids: readonly string[],
  titles: Readonly<Record<string, string>> | undefined,
): readonly string[] {
  return ids.map((id) => titles?.[id] ?? id);
}

/**
 * The reason of an item, worded from its facts and the titles of the Tasks it names; undefined
 * where the Engine's `message` (the CLI's English, with Task keys) stays the reason.
 */
export function attentionReason(
  item: AttentionItem,
  titles: Readonly<Record<string, string>> | undefined,
): Message | undefined {
  switch (item.code) {
    case 'on-hold-blocking': {
      const held = item.blocks && 'taskIds' in item.blocks ? item.blocks.taskIds : [];
      const finish = item.blocks?.finish !== undefined;
      if (held.length === 0 && !finish) {
        return undefined;
      }

      const step = item.stepTitle;

      return held.length > 0 && finish
        ? message('taskOverview.attention.reason.holdsTasksAndFinish', {
            tasks: namedTasks(held, titles),
            step: step ?? message('taskOverview.attention.reason.theStep'),
          })
        : held.length > 0
          ? message('taskOverview.attention.reason.holdsTasks', { tasks: namedTasks(held, titles) })
          : message('taskOverview.attention.reason.holdsFinish', {
              step: step ?? message('taskOverview.attention.reason.theStep'),
            });
    }

    case 'dependency-unsatisfiable': {
      const broken = item.brokenTaskIds ?? [];
      if (broken.length > 0) {
        return message('taskOverview.attention.reason.dependsOnBroken', {
          tasks: namedTasks(broken, titles),
        });
      }

      return item.taskIds && item.taskIds.length > 0
        ? message('taskOverview.attention.reason.dependsOnEnded', {
            tasks: namedTasks(item.taskIds, titles),
          })
        : undefined;
    }

    case 'task-escalated':
      return item.taskIds && item.taskIds.length > 0
        ? message('taskOverview.attention.reason.escalated', {
            tasks: namedTasks(item.taskIds, titles),
          })
        : undefined;
    case 'task-broken':
      return message('taskOverview.attention.reason.broken');
    case 'wait-transition-missing':
      return message('workflowExecution.now.waitTransitionMissing');
    case 'wait-ready-to-settle':
      return message('workflowExecution.now.waitReadyToSettle');
    default:
      return undefined;
  }
}

/** `tasks-stuck` states the intervention: "Resolve 2 blocking tasks". */
export function attentionStuckTitle(item: AttentionItem): Message | undefined {
  return item.code === 'tasks-stuck' && (item.taskIds?.length ?? 0) > 0
    ? message('taskOverview.attention.stuckTitle', { count: item.taskIds!.length })
    : undefined;
}

/**
 * What a Specifications list row leads with for the item the Overview lists first, in the
 * Overview's words: the intervention of a stuck wait ("Resolve 2 blocking tasks"), else the item's
 * action ("Start Review the breakdown", for a Task with its title: "Resume · API"), else its reason.
 */
export function attentionHeadline(
  item: AttentionItem,
  titles: Readonly<Record<string, string>> | undefined,
): Message | string {
  const stuck = attentionStuckTitle(item);
  if (stuck) {
    return stuck;
  }

  const code = item.action && attentionActionHasFlow(item.action) ? item.action : undefined;
  if (code) {
    const action = attentionActionLabel(code, item);

    return item.kind === 'task'
      ? message('specifications.summary.attentionOnTask', { action, task: item.title })
      : action;
  }

  return attentionReason(item, titles) ?? item.reason;
}
