import { isDeepStrictEqual } from 'node:util';

import type { WorkspaceExecutionReceipt } from '../../execution/model';
import type { OwnedExecutionClaim } from '../../specs/durable';
import type { ExecutionCatalogue } from '../definitions/catalogue';
import { SpecificationBusyError } from '../errors';
import { memoryDependencies } from '../operations/operations.test-support';
import type { PostActionResult } from '../operations/post-actions';
import type { WorkflowStore } from '../state/store';
import type { AgentAttemptDependencies } from './dependencies';
import type { FinalizeBoundary } from './finalize/finalize';
import { memoryAgentAttemptJournal } from './journal/memory.test-support';

/** One execution claim of the fake claim journal. */
export interface FakeClaim {
  phase: 'admitted' | 'dispatched' | 'unknown' | 'settled';
  receipt?: WorkspaceExecutionReceipt;
}

/**
 * The agent attempt operations over in-memory state, with fakes a test steers and observes:
 *
 * - `serialize` is the control lock: `held` while a section runs, `sections` counts them, and a
 *   nested section throws (the lock is not re-entrant);
 * - `claims` are the execution claims by invocation id; `settleClaim` requires the lock and settles
 *   one like the Engine (idempotent receipt, never an undispatched claim);
 * - `claimDispatched: false` refuses the `turn` admission (the Turn ended);
 * - `events` logs, in order, every section, store change, journal write, settlement and post action;
 * - `fault` names a finalize boundary that throws (a simulated crash); `refuseStore` refuses the
 *   next finalize store change.
 */
export function memoryAgentDependencies(catalogue: ExecutionCatalogue, attemptId: string) {
  const workflow = memoryDependencies(catalogue);
  const journal = memoryAgentAttemptJournal();
  const admitted: (OwnedExecutionClaim | undefined)[] = [];
  const events: string[] = [];
  const claims = new Map<string, FakeClaim>();
  const state = {
    claimDispatched: true,
    held: false,
    sections: 0,
    fault: undefined as FinalizeBoundary | undefined,
    /** Refuses the next finalize store change (its commit admission, for example). */
    refuseStore: undefined as Error | undefined,
    dirtyPaths: [{ path: 'src/a.ts', sha256: 'b'.repeat(64) }] as {
      path: string;
      sha256: string;
    }[],
    postActionResults: [
      { action: 'commit-execution-state', status: 'completed' },
    ] as PostActionResult[],
  };
  const serialize = workflow.serialize;
  const lockedWorkflow = {
    ...workflow,
    serialize: <T>(operation: () => Promise<T>): Promise<T> => {
      if (state.held) {
        return Promise.reject(new Error('The control lock is not re-entrant.'));
      }

      return serialize(async () => {
        state.held = true;
        state.sections += 1;
        events.push('lock');
        try {
          return await operation();
        } finally {
          state.held = false;
          events.push('unlock');
        }
      });
    },
  };
  const loggedJournal = {
    ...journal,
    async publish(record: Parameters<typeof journal.publish>[0]) {
      events.push('journal');
      await journal.publish(record);
    },
    async settle(id: string) {
      events.push('journal-settled');
      await journal.settle(id);
    },
  };
  const finalizeStore: WorkflowStore = {
    ...workflow.store,
    async apply(specId, change) {
      if (!state.held) {
        throw new Error('A store change outside the lock section.');
      }

      const refusal = state.refuseStore;
      if (refusal) {
        state.refuseStore = undefined;

        throw refusal;
      }

      events.push('store');
      await workflow.store.apply(specId, change);
    },
  };
  const dependencies: AgentAttemptDependencies = {
    workflow: lockedWorkflow,
    journal: loggedJournal,
    admission: (owned) => ({
      admitWrite() {
        admitted.push(owned);
        if (owned?.form === 'turn' && !state.claimDispatched) {
          return Promise.reject(
            new SpecificationBusyError('An agent Turn ended.', {
              cause: 'agent-turn-unknown',
              sessionId: 'session-a',
            }),
          );
        }

        return Promise.resolve();
      },
    }),
    newId: () => attemptId,
    finalize: {
      store: () => finalizeStore,
      settleClaim(intent, receipt) {
        if (!state.held) {
          return Promise.reject(new Error('The lock-held settlement runs without the lock.'));
        }

        const claim = claims.get(intent.operationId);
        if (!claim || claim.phase === 'admitted') {
          return Promise.reject(new Error('No dispatched claim to settle.'));
        }

        if (claim.phase === 'settled' && !isDeepStrictEqual(claim.receipt, receipt)) {
          return Promise.reject(new Error('Settled execution receipt cannot change.'));
        }

        events.push('settle');
        claim.phase = 'settled';
        claim.receipt = receipt;

        return Promise.resolve();
      },
      claimPhase: (invocationId) => Promise.resolve(claims.get(invocationId)?.phase),
      dirtySet: () => Promise.resolve({ paths: state.dirtyPaths, truncated: false }),
      postActions: {
        run() {
          events.push(state.held ? 'post-action-in-lock' : 'post-action');

          return Promise.resolve(state.postActionResults);
        },
      },
      faults(boundary) {
        if (state.fault === boundary) {
          state.fault = undefined;

          throw new Error(`Crash at ${boundary}.`);
        }
      },
    },
  };

  return { dependencies, workflow, journal, admitted, events, claims, state };
}
