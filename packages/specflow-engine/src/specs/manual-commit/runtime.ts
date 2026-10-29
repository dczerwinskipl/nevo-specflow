import type { SpecFlowEngine } from '../../application';
import { openVersionControl } from '../../version-control';
import type { CommitPort } from '../../version-control/commits/port';
import type { ResolvedProjectHome } from '../../project/home/home';
import {
  captureExecutorIdentity,
  nodeProcessTable,
  type ExecutorIdentity,
  type ProcessTable,
} from '../durable/executor-identity';
import type { ClaimSelf, MutationResource } from '../durable/claims';
import type { LedgerOwner } from '../durable/ledger/model';
import type { LeaseErrors } from '../durable/lease';
import { manualCommitError } from './errors';
import type { ManualCommitJournal, ManualCommitScope } from './model';

/**
 * Observation points of a manual commit. Production passes none. Tests await them to stop the process
 * at a cut point (hang until killed, or throw to leave a partial state). Every hook runs OUTSIDE the
 * Project Home control lock except `inClaimAfterLease`, which exists so a test can interrupt the claim
 * between its two writes; a hook that hangs there would hold the lock.
 */
export interface ManualCommitHooks {
  /** The journal is `reserved`; the lease is not taken. */
  afterReserved?(journal: ManualCommitJournal): Promise<void>;
  /** Inside the claim: the lease is written, the journal is not `committing` yet. */
  inClaimAfterLease?(): Promise<void>;
  /** The journal is `committing` (lease, executor and parent recorded); no Git has run. */
  afterClaim?(journal: ManualCommitJournal): Promise<void>;
  /** Just before the commit port is called (the start of the commit is recorded). */
  beforeCommit?(journal: ManualCommitJournal): Promise<void>;
  /** The commit exists; nothing is recorded or verified yet. */
  afterCommit?(journal: ManualCommitJournal, sha: string): Promise<void>;
  /** The commit holds the recorded content of every path. */
  afterVerify?(journal: ManualCommitJournal, sha: string): Promise<void>;
  /** The ledger no longer holds the paths; the journal is not `completed` yet. */
  afterLedgerPruned?(journal: ManualCommitJournal): Promise<void>;
  /** The journal is `completed`; the lease is not released yet. */
  afterCompleted?(journal: ManualCommitJournal): Promise<void>;
}

/** What a manual commit needs from the rest of the Engine. Every field is a seam; the defaults are production. */
export interface ManualCommitDependencies {
  /** The commit port; defaults to the Git port of the engine. */
  readonly commits?: CommitPort;
  /** Wall clock in epoch milliseconds; defaults to the system clock. */
  readonly nowMs?: () => number;
  readonly processTable?: ProcessTable;
  /** The identity written into the lease; defaults to the capture of this process. */
  readonly executor?: ExecutorIdentity;
  readonly hooks?: ManualCommitHooks;
}

export interface ManualCommitOptions {
  /**
   * Operator assertion that the executor recorded in a lease cannot be proven dead but has stopped.
   * Never set by a transport.
   */
  readonly confirmExecutorStopped?: boolean;
  /** Budget of the commit attempt, passed to the port. */
  readonly commitDeadlineMs?: number;
  /** Longest wait for the document queue of the scope before the request is refused (default 10 s). */
  readonly flushWaitMs?: number;
}

export interface ManualCommitRuntime {
  readonly engine: SpecFlowEngine;
  readonly context: ResolvedProjectHome;
  readonly commits: CommitPort;
  readonly hooks: ManualCommitHooks;
  readonly options: ManualCommitOptions;
  readonly table: ProcessTable;
  readonly leaseErrors: LeaseErrors;
  nowIso(): string;
  executor(): Promise<ExecutorIdentity>;
}

export function createManualCommitRuntime(
  engine: SpecFlowEngine,
  deps: ManualCommitDependencies = {},
  options: ManualCommitOptions = {},
): ManualCommitRuntime {
  const table = deps.processTable ?? nodeProcessTable;
  const nowMs = deps.nowMs ?? (() => Date.now());
  let captured = deps.executor;

  return {
    engine,
    context: engine.context,
    commits: deps.commits ?? openVersionControl(engine).commits,
    hooks: deps.hooks ?? {},
    options,
    table,
    leaseErrors: {
      invalid: () => manualCommitError('journal-corrupt', 'The checkout lease is corrupt.'),
    },
    nowIso: () => new Date(nowMs()).toISOString(),
    executor: async () => {
      captured ??= await captureExecutorIdentity(table);

      return captured;
    },
  };
}

/** The checkout a manual commit is made in. */
export interface ManualCommitCheckout {
  readonly workspaceId: string;
  /** Verified physical checkout root. */
  readonly root: string;
}

/** Who the request covers, resolved by the caller (the composition knows Specifications and the Project Home). */
export interface ManualCommitTarget {
  readonly scope: ManualCommitScope;
  readonly checkout: ManualCommitCheckout;
  /** The ledger owners whose entries the request covers. */
  readonly owners: readonly LedgerOwner[];
  /** The Specification the request addressed. */
  readonly specId?: string;
  /** Its slug (the default message). */
  readonly slug?: string;
}

/** The work of the document queue that has not settled in the scope, after the flush. */
export interface QueueRest {
  readonly pending: number;
  readonly failed: number;
  readonly recoveryRequired: number;
}

/** What the manual commit asks of the document queue, which it does not import (ADR 0018 decision 8). */
export interface ManualCommitPorts {
  /**
   * The cross-slice claim check (Create, Close, document journals, manual commits); throws
   * `SharedResourceError`. The composition owns it: this module imports no other slice.
   */
  assertClaims(requested: readonly MutationResource[], self: ClaimSelf): Promise<void>;
  /**
   * Brings the queue of the scope to rest (flushes it, bounded by `waitMs`) and reports what still
   * holds it. The ledger the flush leaves is the one the request is judged on.
   */
  settleQueue(target: ManualCommitTarget, waitMs: number): Promise<QueueRest>;
  /**
   * Refuses (`SPEC_BUSY`) when a document write is under way on any of the paths, or a queue batch
   * holds them. Called under the control lock, at the reservation.
   */
  assertQuiet(target: ManualCommitTarget, paths: readonly string[]): Promise<void>;
}

/**
 * Thrown by a test hook to simulate a process that stopped at that point: the run ends without
 * cleaning up, leaving exactly the records a killed process leaves. Any other error that escapes a
 * run releases the claim first.
 */
export class ManualCommitInterrupted extends Error {
  constructor(point = 'a cut point') {
    super('The manual commit was interrupted at ' + point + '.');
    this.name = 'ManualCommitInterrupted';
  }
}
