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
  /**
   * After an owner's change that finishes no step (Reject, Return) and before an agent's new
   * attempt: the same commit of the Specification's execution state, with `phrase` in its subject,
   * so every owner change is committed by an owner's commit and an agent starts from a checkout
   * where SpecFlow's own workflow state is committed. Absent: nothing runs.
   */
  afterOwnerChange?(event: OwnerChangeEvent): Promise<readonly PostActionResult[]>;
}

export interface OwnerChangeEvent {
  readonly subject: WorkflowSubject;
  /** What happened, for the commit subject (`reject the result of "Review"`). */
  readonly phrase: string;
  /** Body lines of the commit. */
  readonly details?: readonly string[];
}

export interface StepFinishedEvent {
  readonly subject: WorkflowSubject;
  readonly step: string;
  /** The finished step's title (its id when the definition no longer has the step). */
  readonly stepTitle: string;
  readonly attempt: number;
  readonly actor: WorkflowActor;
  /** The finish repeated a recorded one (nothing changed). */
  readonly replayed: boolean;
}

/**
 * The post actions the Engine knows: `commit-execution-state` after a person's finish, and
 * `attempt-commit` after an agent attempt's (D15: its one commit, which holds its execution state
 * too, so the two never compete for one path).
 */
export type PostActionName = 'commit-execution-state' | 'attempt-commit';

export type PostActionResult =
  | {
      readonly action: PostActionName;
      readonly status: 'completed';
      /** The commit the action made; absent when there was nothing to commit. */
      readonly commit?: { readonly sha?: string; readonly paths: readonly string[] };
      /**
       * What it left uncommitted because someone edited it since the Engine wrote it (`edited`), with
       * everything that travels with it (`paths`); absent when nothing was held.
       */
      readonly held?: { readonly edited: readonly string[]; readonly paths: readonly string[] };
    }
  | {
      readonly action: PostActionName;
      readonly status: 'skipped';
      /** Why the action does not apply (`git-disabled`, `auto-commit-on`, `nothing-to-commit`). */
      readonly reason: string;
    }
  | {
      readonly action: PostActionName;
      readonly status: 'failed';
      readonly code: string;
      readonly message: string;
      /**
       * `commit-execution-state`: what it left uncommitted (`paths`, with the hand-edited ones in
       * `edited`) and why it failed (`code`); absent when it committed nothing because of an error.
       */
      readonly held?: { readonly edited: readonly string[]; readonly paths: readonly string[] };
    };

/** A host without post actions (tests, tools). */
export const NO_POST_ACTIONS: WorkflowPostActions = {
  afterStepFinished: () => Promise.resolve([]),
};
