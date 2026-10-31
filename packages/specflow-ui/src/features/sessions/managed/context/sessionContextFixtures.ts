import {
  fullTelemetrySnapshot,
  partialAntigravityTelemetrySnapshot,
  staleTelemetrySnapshot,
} from './sessionTelemetry';
import { unavailableSessionContext } from './sessionContextTypes';
import type { SessionContextTaskRef, SessionContextViewModel } from './sessionContextTypes';

/** Product-owned mock fixtures. Not backend payloads — see `sessionContextTypes.ts`. */

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

/** State A — generic/spec-level Session (full-session-screen-structure.md §12). Also carries a
 * full/available telemetry snapshot (§23/PR #107 demo data) to exercise `SessionTelemetrySection`
 * with every dimension present. */
export function genericSpecLevelContext(): SessionContextViewModel {
  return {
    status: 'ready',
    specification: specA,
    executionScope: { kind: 'generic' },
    relatedTasks: [task02, task03],
    telemetry: fullTelemetrySnapshot,
  };
}

/** State B — single-Task execution (§13). Also carries a partial telemetry snapshot reflecting
 * Antigravity's own documented constraint: usage/limits are observed but cost has no proven
 * currency and stays `unavailable` rather than guessed at. */
export function singleTaskContext(): SessionContextViewModel {
  return {
    status: 'ready',
    specification: specA,
    executionScope: { kind: 'single-task', role: 'Implementer', task: task03 },
    relatedTasks: [task02],
    telemetry: partialAntigravityTelemetrySnapshot,
  };
}

/** State C — Task-batch execution (§14), designed enough not to visibly break (not this pass's
 * primary validation target). */
export function batchContext(): SessionContextViewModel {
  return {
    status: 'ready',
    specification: specA,
    executionScope: { kind: 'batch', role: 'Reviewer', tasks: [task02, task03, task04] },
    relatedTasks: [task05],
  };
}

/** State D — Session requires human interaction (§15): Context orients without duplicating the
 * actionable controls, which remain in Primary. */
export function pendingInteractionContext(): SessionContextViewModel {
  return {
    status: 'ready',
    specification: specA,
    executionScope: { kind: 'single-task', role: 'Implementer', task: task03 },
    attention: [
      {
        id: 'session-interaction',
        tone: 'attention',
        summary: 'Agent needs your input in the conversation.',
        readOnly: true,
      },
    ],
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
 * informational, not as a "needs attention" warning the text itself contradicts (owner audit) —
 * the fix is the icon/tone, the copy's own meaning is unchanged. */
export function terminalOutcomeContext(): SessionContextViewModel {
  return {
    status: 'ready',
    specification: specA,
    executionScope: { kind: 'single-task', role: 'Implementer', task: task03 },
    attention: [
      {
        id: 'task-03-attention',
        tone: 'info',
        summary: 'Still active — no recovery required yet.',
        task: task03,
      },
    ],
    // Stale telemetry (§23/PR #107 demo data): observed before this outcome settled and not yet
    // reconfirmed, so every telemetry line must show the subtle "stale" cue, not read as live.
    telemetry: staleTelemetrySnapshot,
  };
}

/** State I — unavailable/unknown Session state (§20): the projection itself could not be read. */
export function unavailableContext(): SessionContextViewModel {
  return unavailableSessionContext;
}

/** Graceful full omission: every optional section absent (owner decision 2 — a missing group must
 * never crash or show a broken UI, including before any optional section has ever shipped). */
export function emptyContext(): SessionContextViewModel {
  return { status: 'ready' };
}

/** Stress fixture: long titles, a longer related-Task list, mixed attention tones. */
export function stressContext(): SessionContextViewModel {
  return {
    status: 'ready',
    specification: {
      id: 'spec-long',
      key: 'SPEC-LONG',
      title:
        'Cross-module authorization and recovery hardening for the deterministic workflow engine',
    },
    executionScope: {
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
    },
    attention: [
      {
        id: 'a1',
        tone: 'attention',
        summary: 'Agent needs your input in the conversation.',
        readOnly: true,
      },
      { id: 'a2', tone: 'info', summary: 'TASK-05 requires owner review.', task: task05 },
    ],
    relatedTasks: [
      task04,
      task05,
      { id: 'task-06', key: 'TASK-06', title: 'Archive the migration notes' },
    ],
  };
}
