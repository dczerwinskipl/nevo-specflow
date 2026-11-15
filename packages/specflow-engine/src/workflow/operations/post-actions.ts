import type { WorkflowActor, WorkflowSubject } from '../state/model';

/**
 * Workflow post actions: what the host does once a workflow operation's change is published, outside
 * the project control lock. The hook point is the finish of a step ("Next"); it runs after every
 * finish, a repeated one included, so an action that failed the first time runs again on the retry.
 *
 * Owner decision 2026-11-12: with auto-commit off, finishing a step commits the Specification's
 * current execution state (`commit-execution-state`, wired in `composition.ts`). Planned (E6, not
 * implemented): an agent step's finish also pushes its work (`push`).
 *
 * An action reports its own failure as a result and never throws for it: the finish is recorded
 * already and stays successful; what the action left (uncommitted state, for example) is visible and
 * a Close takes it with its archive commit.
 */
export interface WorkflowPostActions {
  afterStepFinished(event: StepFinishedEvent): Promise<readonly PostActionResult[]>;
}

export interface StepFinishedEvent {
  readonly subject: WorkflowSubject;
  readonly step: string;
  readonly attempt: number;
  readonly actor: WorkflowActor;
  /** The finish repeated a recorded one (nothing changed). */
  readonly replayed: boolean;
}

/** The post actions the Engine knows; `push` is reserved for E6. */
export type PostActionName = 'commit-execution-state';

export type PostActionResult =
  | {
      readonly action: PostActionName;
      readonly status: 'completed';
      /** The commit the action made; absent when there was nothing to commit. */
      readonly commit?: { readonly sha?: string; readonly paths: readonly string[] };
    }
  | {
      readonly action: PostActionName;
      readonly status: 'skipped';
      /** Why the action does not apply (`git-disabled`, `auto-commit-on`). */
      readonly reason: string;
    }
  | {
      readonly action: PostActionName;
      readonly status: 'failed';
      readonly code: string;
      readonly message: string;
    };

/** A host without post actions (tests, tools). */
export const NO_POST_ACTIONS: WorkflowPostActions = {
  afterStepFinished: () => Promise.resolve([]),
};
