import type { SessionSnapshot } from '@nevo/specflow-contracts/sessions';
import { fixtureSessionId } from './managedSession.stories-support';

/** Isolated presentation adapters for the Full Session state fixtures: never imported by a
 * production route. Each builds a realistic `SessionSnapshot` for one state validated this pass
 * (full-session-screen-structure.md §12/§13/§15/§18/§19/§20). */

const turnId = '00000000-0000-4000-8000-000000000010';

function base(): SessionSnapshot {
  return {
    session: {
      sessionId: fixtureSessionId,
      projectId: 'project',
      providerId: 'claude-code',
      mode: 'workspace-write',
      title: 'Workflow admission hardening',
      readiness: 'ready',
      capabilities: {
        view: true,
        manage: true,
        start: true,
        cancel: false,
        questions: true,
        permissions: true,
      },
      createdAt: '2026-10-29T09:00:00Z',
      updatedAt: '2026-10-29T09:00:00Z',
    },
    revision: 1,
    eventSeq: 1,
    history: { hasOlder: false },
    entries: [
      {
        id: 'request',
        turnId,
        ordinal: 1,
        revision: 1,
        kind: 'request',
        createdAt: '2026-10-29T09:00:00Z',
        text: { text: 'Investigate why workflow admission is failing.', complete: true },
      },
    ],
  };
}

/** State A — generic/spec-level Session (§12). */
export function genericSpecLevelSnapshot(): SessionSnapshot {
  const snapshot = base();
  snapshot.entries.push({
    id: 'commentary-1',
    turnId,
    ordinal: 2,
    revision: 1,
    kind: 'commentary',
    createdAt: '2026-10-29T09:00:05Z',
    text: { text: 'Checking the workflow admission path…', complete: true },
  });
  snapshot.activeTurn = { turnId, state: 'active', revision: 1, startedAt: '2026-10-29T09:00:00Z' };
  snapshot.currentActivity = {
    kind: 'tool',
    turnId,
    label: 'Searching repository…',
  };

  return snapshot;
}

/** State B — single-Task execution (§13): the same free-text `currentActivity.label` carries the
 * Task identity; the canonical contract needs no new field for this. */
export function singleTaskSnapshot(): SessionSnapshot {
  const snapshot = genericSpecLevelSnapshot();
  snapshot.currentActivity = {
    kind: 'tool',
    turnId,
    label: 'Implementer · TASK-03 · Editing workflow admission…',
  };

  return snapshot;
}

/** State G — waiting without human action (§18): calm live state, not attention. */
export function waitingWithoutAttentionSnapshot(): SessionSnapshot {
  const snapshot = base();
  snapshot.activeTurn = {
    turnId,
    state: 'waiting',
    revision: 1,
    startedAt: '2026-10-29T09:00:00Z',
  };
  snapshot.currentActivity = { kind: 'waiting', turnId, label: 'Waiting for model response…' };

  return snapshot;
}

/** State H — terminal failure (§19): a failed Tool stays distinct from a failed Turn; here the
 * Turn itself is terminal/failed. */
export function terminalFailureSnapshot(): SessionSnapshot {
  const snapshot = base();
  snapshot.entries.push(
    {
      id: 'commentary-1',
      turnId,
      ordinal: 2,
      revision: 1,
      kind: 'commentary',
      createdAt: '2026-10-29T09:00:05Z',
      text: { text: 'Running the workflow test suite…', complete: true },
    },
    {
      id: 'outcome-1',
      turnId,
      ordinal: 3,
      revision: 1,
      kind: 'outcome',
      createdAt: '2026-10-29T09:00:20Z',
      text: { text: 'failed', complete: true },
    },
  );

  return snapshot;
}

/** State I — unavailable Session (§20): history is preserved; action availability follows
 * authoritative readiness, not a fabricated ready/empty snapshot. */
export function unavailableSnapshot(): SessionSnapshot {
  const snapshot = base();
  snapshot.session = {
    ...snapshot.session,
    readiness: 'unavailable',
    capabilities: { ...snapshot.session.capabilities, start: false, cancel: false },
  };
  snapshot.entries.push({
    id: 'answer-1',
    turnId,
    ordinal: 2,
    revision: 1,
    kind: 'answer',
    createdAt: '2026-10-29T09:00:10Z',
    text: { text: 'The admission guard change is ready for review.', complete: true },
  });

  return snapshot;
}
