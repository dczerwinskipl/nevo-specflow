import { workInspectorTurnId } from '../managedSession.workInspector.stories-support';
import {
  fullTelemetrySnapshot,
  partialAntigravityTelemetrySnapshot,
  staleTelemetrySnapshot,
  telemetryMeasuredTurnId,
} from './sessionTelemetry.stories-support';
import type {
  ContextFact,
  SessionContextTaskRef,
  SessionContextViewModel,
  SessionExecutor,
} from './sessionContextTypes';

/** Product-owned mock fixtures. Not backend payloads — see `sessionContextTypes.ts`. */

const ready = <T>(value: T): ContextFact<T> => ({ status: 'ready', value });

const specA = { id: 'spec-a', key: 'SPEC-A', title: 'Workflow admission hardening' };

const task02: SessionContextTaskRef = {
  id: 'task-02',
  key: 'TASK-02',
  title: 'Document the admission guard',
};
const task03: SessionContextTaskRef = {
  id: 'task-03',
  key: 'TASK-03',
  title: 'Deterministic admission',
};
const task04: SessionContextTaskRef = {
  id: 'task-04',
  key: 'TASK-04',
  title: 'Recovery transition tests',
};
const task05: SessionContextTaskRef = {
  id: 'task-05',
  key: 'TASK-05',
  title: 'Update the readiness policy snapshot',
};

/** The executor a real route shows once the Runtime's provider catalogue has loaded. */
export const claudeExecutor: SessionExecutor = {
  providerId: 'claude',
  providerTitle: 'Claude',
  modelTitle: 'Opus 4.1',
  effort: 'high',
};

/** The live Turn of `richDefaultApi` (`workInspectorTurnId`): opening Context's "Work history" row
 * lands on the same Work its chat Work block opens (same tab either way). */
const workHistory = ready({ turnId: workInspectorTurnId });

/** State A — generic/spec-level Session (full-session-screen-structure.md §1). Also carries a
 * full/available telemetry snapshot (full-session.md "Context";
 * `sessionTelemetry.stories-support.ts`) to exercise `SessionTelemetrySection`
 * with every dimension present. Shows the Documents row once a handler is wired. */
export function genericSpecLevelContext(): SessionContextViewModel {
  return {
    scope: { kind: 'specification' },
    specification: ready(specA),
    executionScope: ready({ kind: 'generic' }),
    relatedTasks: ready([task02, task03]),
    telemetry: fullTelemetrySnapshot,
    workHistory,
    // The measured Turn is the one still running, so the context window reads "Current Turn".
    runningTurnId: telemetryMeasuredTurnId,
  };
}

/** Same Session after its last Turn settled: still active and ready for the next message, but no
 * Turn is running (`runningTurnId` absent), so the context-window measurement is labelled as the
 * last Turn's, not the current one. */
export function settledTurnContext(): SessionContextViewModel {
  const { runningTurnId: _running, ...settled } = genericSpecLevelContext();

  return settled;
}

/** State B — single-Task execution (§13). Also carries a partial telemetry snapshot reflecting
 * Antigravity's own documented constraint: usage/limits are observed but cost has no proven
 * currency and stays `unavailable` rather than guessed at. */
export function singleTaskContext(): SessionContextViewModel {
  return {
    scope: { kind: 'task', taskCount: 1 },
    specification: ready(specA),
    executionScope: ready({ kind: 'single-task', role: 'Implementer', task: task03 }),
    relatedTasks: ready([task02]),
    telemetry: partialAntigravityTelemetrySnapshot,
  };
}

/** State C — Task-batch execution (§14), designed enough not to visibly break (not a primary
 * validation target). */
export function batchContext(): SessionContextViewModel {
  return {
    scope: { kind: 'task', taskCount: 3 },
    specification: ready(specA),
    executionScope: ready({ kind: 'batch', role: 'Reviewer', tasks: [task02, task03, task04] }),
    relatedTasks: ready([task05]),
  };
}

/** State D — Session requires human interaction (§15): Context orients without duplicating the
 * actionable controls, which remain in Primary. */
export function pendingInteractionContext(): SessionContextViewModel {
  return {
    scope: { kind: 'task', taskCount: 1 },
    specification: ready(specA),
    executionScope: ready({ kind: 'single-task', role: 'Implementer', task: task03 }),
    attention: ready([
      {
        id: 'session-interaction',
        tone: 'attention',
        summary: 'Agent needs your input in the conversation.',
        readOnly: true,
      },
    ]),
  };
}

/** State G — waiting without human action (§18): same shape as the generic Session; Context
 * must not invent a next human action merely because the Turn is waiting. */
export function waitingWithoutAttentionContext(): SessionContextViewModel {
  return singleTaskContext();
}

/** State H — terminal failure/cancellation/interruption (§19): Turn outcome and Task/workflow
 * consequence stay separate facts. The Task's own summary says no recovery action is needed yet
 * (Task-level consequence, independent of the Turn's own failure), so its tone must read as
 * informational, not as a "needs attention" warning the text itself contradicts. */
export function terminalOutcomeContext(): SessionContextViewModel {
  return {
    scope: { kind: 'task', taskCount: 1 },
    specification: ready(specA),
    executionScope: ready({ kind: 'single-task', role: 'Implementer', task: task03 }),
    attention: ready([
      {
        id: 'task-03-attention',
        tone: 'info',
        summary: 'Still active — no recovery required yet.',
        task: task03,
      },
    ]),
    // Stale telemetry (§23, `sessionTelemetry.stories-support.ts`): observed before this outcome settled and not yet
    // reconfirmed, so every telemetry line must show the subtle "stale" cue, not read as live.
    telemetry: staleTelemetrySnapshot,
  };
}

/** A standalone Session on the real route: its association read says `standalone`, so only the
 * executor and Work history (derived from the Session's own snapshot) show, with no note. */
export function realRouteContext(): SessionContextViewModel {
  return {
    scope: { kind: 'standalone' },
    executor: ready(claudeExecutor),
    workHistory,
    runningTurnId: workInspectorTurnId,
  };
}

/** The real route before the first snapshot, the provider catalogue and the association read
 * arrive: no Specification section yet (no skeleton that could vanish for a standalone Session). */
export function realRouteLoadingContext(): SessionContextViewModel {
  return {
    scope: { kind: 'unknown', reason: 'loading' },
    executor: { status: 'loading' },
    workHistory: { status: 'loading' },
  };
}

/** State I — the Session's links to a Specification/Tasks exist but could not be read (§11). */
export function associationsUnreadableContext(): SessionContextViewModel {
  return {
    scope: { kind: 'unknown', reason: 'unreadable' },
    executor: ready(claudeExecutor),
    workHistory,
  };
}

/** A Session with no Specification association at all: nothing is promised, so no note either. */
export function standaloneContext(): SessionContextViewModel {
  return {
    scope: { kind: 'standalone' },
    executor: ready(claudeExecutor),
    workHistory,
    runningTurnId: workInspectorTurnId,
  };
}

/** Specification-scoped Session whose Specification is still loading (skeleton under its label). */
export function specLoadingContext(): SessionContextViewModel {
  return {
    ...genericSpecLevelContext(),
    executor: ready(claudeExecutor),
    specification: { status: 'loading' },
  };
}

/** The Specification exists but could not be read: a warning in its slot. */
export function specUnreadableContext(): SessionContextViewModel {
  return {
    ...genericSpecLevelContext(),
    executor: ready(claudeExecutor),
    specification: { status: 'unreadable' },
  };
}

/** A required Specification that cannot be found: an error (danger) note naming its key. */
export function specRequiredMissingContext(): SessionContextViewModel {
  return {
    ...genericSpecLevelContext(),
    executor: ready(claudeExecutor),
    specification: { status: 'missing', ref: { key: 'SPEC-A' } },
  };
}

/** A Task-scoped Session whose Task cannot be found: an error note in Current execution. */
export function taskRequiredMissingContext(): SessionContextViewModel {
  return {
    ...singleTaskContext(),
    executor: ready(claudeExecutor),
    executionScope: { status: 'missing', ref: { key: 'TASK-03' } },
    attention: { status: 'loading' },
  };
}

/** A batch of three Tasks of which one cannot be found: the two found Tasks still show beside the
 * error note. */
export function batchPartialMissingContext(): SessionContextViewModel {
  return {
    ...batchContext(),
    executor: ready(claudeExecutor),
    executionScope: ready({
      kind: 'batch',
      role: 'Reviewer',
      tasks: [task02, task03],
      missingTaskCount: 1,
    }),
  };
}

/** Attention could not be checked: a warning in its slot. */
export function attentionUnreadableContext(): SessionContextViewModel {
  return {
    ...singleTaskContext(),
    executor: ready(claudeExecutor),
    attention: { status: 'unreadable' },
  };
}

/** Related Tasks could not be loaded: a warning in its slot. */
export function relatedTasksUnreadableContext(): SessionContextViewModel {
  return {
    ...singleTaskContext(),
    executor: ready(claudeExecutor),
    relatedTasks: { status: 'unreadable' },
  };
}

/** The executor the Session names is no longer in the provider catalogue: an error note. */
export function executorMissingContext(): SessionContextViewModel {
  return {
    ...realRouteContext(),
    executor: { status: 'missing', ref: { key: 'claude' } },
  };
}

/** Stress fixture: long titles, a longer related-Task list, mixed attention tones. */
export function stressContext(): SessionContextViewModel {
  return {
    scope: { kind: 'task', taskCount: 3 },
    specification: ready({
      id: 'spec-long',
      key: 'SPEC-LONG',
      title:
        'Cross-module authorization and recovery hardening for the deterministic workflow engine',
    }),
    executionScope: ready({
      kind: 'batch',
      role: 'Reviewer',
      tasks: [
        task02,
        task03,
        {
          id: 'task-long',
          key: 'TASK-99',
          title:
            'Reconcile the readiness policy with the recovery transition table across every provider adapter',
        },
      ],
    }),
    attention: ready([
      {
        id: 'a1',
        tone: 'attention',
        summary: 'Agent needs your input in the conversation.',
        readOnly: true,
      },
      { id: 'a2', tone: 'info', summary: 'TASK-05 requires owner review.', task: task05 },
    ]),
    relatedTasks: ready([
      task04,
      task05,
      { id: 'task-06', key: 'TASK-06', title: 'Archive the migration notes' },
    ]),
  };
}
