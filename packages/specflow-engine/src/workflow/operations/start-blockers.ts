import type { WorkflowPin } from '@nevo/workflow';

import type { TaskContextEntry } from '../../tasks/resource/model';
import type { TaskContextIssue, TaskResourceIssue } from '../../tasks/resource/validate';
import type { GateStatus } from '../gates/evaluate';
import type { TaskStatus } from '../state/model';

/** Why the next step of a subject cannot start. */
export type StartBlocker =
  | { readonly kind: 'status'; readonly status: Exclude<TaskStatus, 'ready'> }
  | {
      readonly kind: 'dependencies';
      /** Every dependency that has not completed, in declared order. */
      readonly waitingFor: readonly string[];
      /** Those that can no longer complete (ended otherwise, cancelled or broken). */
      readonly unsatisfiable: readonly string[];
    }
  /** The Task's files are inconsistent (`ExecutionInspection.brokenTasks`); restore them from Git. */
  | {
      readonly kind: 'broken';
      readonly reason:
        Extract<TaskResourceIssue, { kind: 'broken' | 'dangling' }>['reason'] | 'position';
    }
  /** The workflow the run is pinned to is missing or changed (`WORKFLOW_DEFINITION_CHANGED`). */
  | { readonly kind: 'definition-changed'; readonly pinned: WorkflowPin }
  /** First start: the task type is not allowed by the effective policy any more. */
  | { readonly kind: 'type-not-allowed'; readonly message: string }
  /** First start: the task type or its workflow is not defined. */
  | { readonly kind: 'definition-missing'; readonly message: string }
  /** First start of a Specification: its archetype has no usable execution binding. */
  | { readonly kind: 'not-configured'; readonly message: string }
  /** A required context entry does not resolve (`WORKFLOW_TASK_CONTEXT_UNRESOLVED`). */
  | {
      readonly kind: 'context-unresolved';
      readonly entries: readonly {
        /** Position in the context list, from 0. */
        readonly index: number;
        readonly kind: TaskContextEntry['kind'];
        readonly reason: TaskContextIssue['reason'];
      }[];
    }
  /**
   * A required process artifact (`artifact: true`) does not exist yet: expected, not stale. The start
   * is refused like an unresolved entry (`WORKFLOW_TASK_CONTEXT_UNRESOLVED`, `awaited`).
   */
  | {
      readonly kind: 'context-awaited';
      readonly entries: readonly {
        readonly index: number;
        readonly kind: Exclude<TaskContextEntry['kind'], 'instructions'>;
      }[];
    }
  /** An entry gate of the step does not hold (`WORKFLOW_GATE_UNSATISFIED`); the unsatisfied ones. */
  | { readonly kind: 'gates-unsatisfied'; readonly gates: readonly GateStatus[] };
