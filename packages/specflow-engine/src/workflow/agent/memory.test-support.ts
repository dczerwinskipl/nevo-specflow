import { isDeepStrictEqual } from 'node:util';

import type { WorkspaceExecutionReceipt } from '../../execution/model';
import type { OwnedExecutionClaim } from '../../specs/durable';
import type { LedgerEntry } from '../../specs/durable/ledger/model';
import type { ExecutionCatalogue } from '../definitions/catalogue';
import { SpecificationBusyError } from '../errors';
import { memoryDependencies } from '../operations/operations.test-support';
import type { PostActionResult, StepFinishedEvent } from '../operations/post-actions';
import type { WorkflowStore } from '../state/store';
import type { AttributionFacts } from './boundary/attribution';
import type { AgentContextSource } from './context/gather';
import type { AgentAttemptDependencies } from './dependencies';
import type { FinalizeBoundary } from './finalize/finalize';
import { memoryAgentAttemptJournal } from './journal/memory.test-support';
import { agentPostActionRunId } from './journal/model';

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
    /** Document changes of the Turn still being written (`openWrites`). */
    openWrites: [] as string[],
    /** Refuses the next finalize store change (its commit admission, for example). */
    refuseStore: undefined as Error | undefined,
    dirtyPaths: [{ path: 'src/a.ts', sha256: 'b'.repeat(64) }] as {
      path: string;
      sha256: string;
    }[],
    /** What the attribution checks read; `undefined` is Git off (nothing is checked). */
    attribution: undefined as AttributionFacts | undefined,
    /** The operation of each post action run (`agentPostActionRunId`), in order. */
    postActionRuns: [] as string[],
    postActionResults: [{ action: 'attempt-commit', status: 'completed' }] as PostActionResult[],
    /** The uncommitted-changes ledger entries of the Specification (`ledger`). */
    ledger: [] as LedgerEntry[],
    /** The owner's post actions the agent operations ran (after a Confirm), in order. */
    ownerPostActions: [] as StepFinishedEvent[],
    /** The content hash of every registered document file the agent context reads (`context`). */
    documentSha: 'c'.repeat(64),
    /** How many times the agent context was read (`context.documents`). */
    contextReads: 0,
  };
  /** The agent context: one overview, no document types; every document file hashes `documentSha`. */
  const context: AgentContextSource = {
    documents: () => {
      state.contextReads += 1;

      return Promise.resolve([
        {
          id: 'overview',
          type: 'overview',
          title: 'Overview',
          path: 'specs/feature/overview.md',
          revision: 'r1',
          templateOnly: false,
        },
      ]);
    },
    catalogue: () => Promise.resolve({ documentTypes: [] }),
    documentFile: (_scope, documentId) =>
      Promise.resolve({ path: `${documentId}.md`, bytes: 10, sha256: state.documentSha }),
    checkoutFile: () => Promise.resolve(undefined),
  };
  const serialize = workflow.serialize;
  const lockedWorkflow = {
    ...workflow,
    postActions: {
      afterStepFinished(event: StepFinishedEvent): Promise<readonly PostActionResult[]> {
        events.push(state.held ? 'owner-post-action-in-lock' : 'owner-post-action');
        state.ownerPostActions.push(event);

        return Promise.resolve([{ action: 'commit-execution-state', status: 'completed' }]);
      },
    },
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
    context,
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
    attributedStore: () => workflow.store,
    newId: () => attemptId,
    boundary: { facts: () => Promise.resolve(state.attribution) },
    ledger: () => Promise.resolve([...state.ledger]),
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
      claim(invocationId) {
        const claim = claims.get(invocationId);

        return Promise.resolve(
          claim && {
            phase: claim.phase,
            ...(claim.receipt
              ? { settlement: { kind: 'native-result', receipt: claim.receipt } }
              : {}),
          },
        );
      },
      openWrites: () => Promise.resolve([...state.openWrites]),
      dirtySet: () => Promise.resolve({ paths: state.dirtyPaths, truncated: false }),
      postActions: {
        run(_journal, action) {
          events.push(state.held ? 'post-action-in-lock' : 'post-action');
          state.postActionRuns.push(agentPostActionRunId(action));

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
