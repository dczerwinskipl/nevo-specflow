import { ATTENTION_REASONS, type AgentLaunch, type LaunchBlocker } from '../continuation/resolve';
import type { WorkflowSubject } from '../state/model';
import type { BlockingTask } from '../tasks/tasks';

export { BLOCKING_TASK_CAUSES, type BlockingTask, type BlockingTaskCause } from '../tasks/tasks';

/**
 * Why a subject needs a person. The continuation reasons (`ATTENTION_REASONS`) come from what a
 * finished attempt, a return or the wait step decided; the others come from the state of a Task:
 *
 * - `task-broken`: the Task's files are inconsistent;
 * - `definition-changed`: the workflow its run is pinned to is missing or changed;
 * - and the start blockers of an approved Task that has not started that need a person
 *   (`context-unresolved`, `dependency-unsatisfiable`, `type-not-allowed`, `definition-missing`,
 *   `entry-gate-unsatisfied`). Waiting for dependencies that can still complete, an awaited process
 *   artifact, being ready to start and being a draft are not attention.
 */
export const ATTENTION_ITEM_REASONS = [
  ...ATTENTION_REASONS,
  'task-broken',
  'definition-changed',
  'context-unresolved',
  'dependency-unsatisfiable',
  'type-not-allowed',
  'definition-missing',
  'entry-gate-unsatisfied',
] as const;
export type AttentionItemReason = (typeof ATTENTION_ITEM_REASONS)[number];

/** An action an item offers; a surface maps it to its own command or page. */
export const ATTENTION_ACTIONS = [
  /** Start (or resume) the step the item names. */
  'start-step',
  /** Return the run to an earlier step (the workflow menu). */
  'return-to-step',
  /** Choose a provider or model, or fix the agent archetype, of the step. */
  'configure-archetype',
  /** Open the Specification's Tasks the item names (`taskIds`) and decide them. */
  'review-tasks',
  /** Restore the files of the broken Task (the item's own, or the dependencies it names) from Git. */
  'restore-task',
  /** Review the workflow revision the run is pinned to (re-pinning is not supported yet). */
  'confirm-definition',
  'edit-context',
  'edit-dependencies',
  /** The task types and workflows are project definitions: open the project settings. */
  'open-project-settings',
  'cancel-task',
  /** Make an entry gate of the step hold (for example write the document it names). */
  'satisfy-gate',
] as const;
export type AttentionAction = (typeof ATTENTION_ACTIONS)[number];

/** Who has to act. The Engine derives owner items only today; `agent` is reserved for agent steps. */
export type AttentionActor = 'owner' | 'agent';

/**
 * A subject a person has to act on. Never stored: it is derived from the canonical runs, the
 * pinned definitions, the current archetypes and (for start blockers) the action projection on
 * every read, so it always describes the subject's current state, whatever changed it (an
 * operation, a branch switch, a pull). At most one item exists per subject, none for a subject
 * that is being worked on, and fixing the cause removes it by construction.
 */
export interface AttentionItem {
  readonly subject: WorkflowSubject;
  /** The step the item is about; absent when none resolves (a broken Task, an unknown type). */
  readonly step?: string;
  /** The step's title, from the definition. */
  readonly stepTitle?: string;
  readonly reason: AttentionItemReason;
  readonly actor: AttentionActor;
  /** The one primary action. */
  readonly action: AttentionAction;
  /** An alternative when the primary one is not wanted (for example `cancel-task`). */
  readonly secondaryAction?: AttentionAction;
  /** One English sentence for surfaces without their own copy (CLI, MCP); display only. */
  readonly message: string;
  /**
   * `task-escalated`: every escalated Task; `tasks-stuck`: the Tasks to resolve (`blocking`);
   * `dependency-unsatisfiable`: the dependencies that can no longer complete (`restore-task`: the
   * broken ones among them). In id order.
   */
  readonly taskIds?: readonly string[];
  /** `tasks-stuck`: each Task of `taskIds` with why it blocks (always set, possibly empty). */
  readonly blocking?: readonly BlockingTask[];
  readonly archetype?: string;
  readonly provider?: string;
  readonly blocker?: LaunchBlocker;
  readonly suggestion?: AgentLaunch;
}
