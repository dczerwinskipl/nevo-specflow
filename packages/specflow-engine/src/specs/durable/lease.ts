import { lstat, mkdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';

import { writeJsonAtomically } from '../../project/fs/atomic-json';
import { readFileWindowsSafe, removeFileWindowsSafe } from '../../project/fs/windows-safe-fs';
import type { ResolvedProjectHome } from '../../project/home/home';
import {
  proveExecutorState,
  nodeProcessTable,
  isExecutorIdentity,
  type ExecutorIdentity,
  type ExecutorState,
  type ProcessTable,
} from './executor-identity';
import { exactKeys, isIsoInstant, isRecord } from './guards';
import { OPERATION_ID_PATTERN, isMissing } from './journal-store';

/**
 * The per-checkout lease (ADR 0016 decision 5, shared with the manual commit by ADR 0018 decision 8):
 * the one process that runs Git commits for a checkout, whether a batch of the document queue or a
 * manual commit. One file per checkout: `engine/operations/documents/leases/<workspaceId>.json`.
 * Every function that reads or writes it is called while the caller holds the Project Home control
 * lock, which is what makes a take-over a compare-and-replace: the record is read, judged and
 * replaced inside one critical section. The directory keeps the name it had when only the queue used
 * it; the file is the single place the two holders exclude each other.
 */
export const CHECKOUT_LEASE_RELATIVE_DIR = 'engine/operations/documents/leases';
export const CHECKOUT_LEASE_VERSION = 1;
export const CHECKOUT_LEASE_MAX_BYTES = 4 * 1024;

export interface CheckoutLease {
  readonly version: typeof CHECKOUT_LEASE_VERSION;
  readonly projectId: string;
  readonly workspaceId: string;
  readonly executor: ExecutorIdentity;
  /** The operation that holds the lease: a commit batch of the queue or a manual commit. */
  readonly batchId: string;
  readonly acquiredAt: string;
}

/** How a kind of holder reports a lease file it cannot trust (the error vocabulary of the holder). */
export interface LeaseErrors {
  readonly invalid: () => Error;
}

export function parseCheckoutLease(
  context: { readonly project: { readonly projectId: string } },
  value: unknown,
  workspaceId: string,
  errors: LeaseErrors,
): CheckoutLease {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'version',
      'projectId',
      'workspaceId',
      'executor',
      'batchId',
      'acquiredAt',
    ]) ||
    value.version !== CHECKOUT_LEASE_VERSION ||
    value.projectId !== context.project.projectId ||
    value.workspaceId !== workspaceId ||
    !OPERATION_ID_PATTERN.test(workspaceId) ||
    !isExecutorIdentity(value.executor) ||
    typeof value.batchId !== 'string' ||
    !OPERATION_ID_PATTERN.test(value.batchId) ||
    !isIsoInstant(value.acquiredAt) ||
    Buffer.byteLength(JSON.stringify(value), 'utf8') > CHECKOUT_LEASE_MAX_BYTES
  ) {
    throw errors.invalid();
  }
  return value as unknown as CheckoutLease;
}

export function leasePath(context: ResolvedProjectHome, workspaceId: string): string {
  return join(context.project.stateRoot, CHECKOUT_LEASE_RELATIVE_DIR, workspaceId + '.json');
}

async function ensureLeaseDirectory(
  context: ResolvedProjectHome,
  errors: LeaseErrors,
): Promise<void> {
  const directory = join(context.project.stateRoot, CHECKOUT_LEASE_RELATIVE_DIR);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (await realpath(directory)) !== directory) {
    throw errors.invalid();
  }
}

/** The lease of a checkout, `undefined` when there is none. A corrupt or redirected file fails closed. */
export async function readCheckoutLease(
  context: ResolvedProjectHome,
  workspaceId: string,
  errors: LeaseErrors,
): Promise<CheckoutLease | undefined> {
  const path = leasePath(context, workspaceId);
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > CHECKOUT_LEASE_MAX_BYTES) {
      throw errors.invalid();
    }
    let value: unknown;
    try {
      value = JSON.parse(await readFileWindowsSafe(path));
    } catch (error) {
      if (isMissing(error)) throw error;
      throw errors.invalid();
    }
    return parseCheckoutLease(context, value, workspaceId, errors);
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

/** Creates or replaces the lease (atomic publish). */
export async function writeCheckoutLease(
  context: ResolvedProjectHome,
  lease: Omit<CheckoutLease, 'version' | 'projectId'>,
  errors: LeaseErrors,
): Promise<CheckoutLease> {
  const record: CheckoutLease = {
    version: CHECKOUT_LEASE_VERSION,
    projectId: context.project.projectId,
    ...lease,
  };
  parseCheckoutLease(context, record, record.workspaceId, errors);
  await ensureLeaseDirectory(context, errors);
  await writeJsonAtomically(leasePath(context, record.workspaceId), record);
  return record;
}

/** Releases the lease; absent is fine. */
export async function removeCheckoutLease(
  context: ResolvedProjectHome,
  workspaceId: string,
): Promise<void> {
  await removeFileWindowsSafe(leasePath(context, workspaceId)).catch((error: unknown) => {
    if (!isMissing(error)) throw error;
  });
}

/**
 * Releases the lease only while it still names `batchId`: after an operator took the checkout over,
 * the lease belongs to its new holder and a slow executor must not remove it.
 */
export async function removeCheckoutLeaseOf(
  context: ResolvedProjectHome,
  workspaceId: string,
  batchId: string,
  errors: LeaseErrors,
): Promise<void> {
  const lease = await readCheckoutLease(context, workspaceId, errors);
  if (lease?.batchId === batchId) await removeCheckoutLease(context, workspaceId);
}

/**
 * Leases a process executes under right now, keyed by checkout. A second run in the same process
 * (or a second copy of this module in it: the map sits on the global symbol registry) finds the
 * lease held by itself and must not start a second batch or a manual commit.
 */
const ACTIVE = Symbol.for('nevo.specflow.engine.documentQueue.activeLeases');
const active: Set<string> = ((globalThis as Record<symbol, unknown>)[ACTIVE] ??=
  new Set<string>()) as Set<string>;

export function markLeaseActive(workspaceId: string): boolean {
  if (active.has(workspaceId)) return false;
  active.add(workspaceId);
  return true;
}

export function markLeaseIdle(workspaceId: string): void {
  active.delete(workspaceId);
}

/**
 * What a recorded executor means for a lease or a committing operation:
 * - `held`: it may still be running (alive, unknown, or this very process executing right now);
 *   nobody takes the lease over.
 * - `takeover`: provably gone (the dead proof), this process left it idle (a stop inside it), or an
 *   operator asserted it.
 */
export type LeaseVerdict =
  | { readonly kind: 'held'; readonly state: ExecutorState }
  | { readonly kind: 'takeover'; readonly proof: ExecutorState | 'asserted' };

export async function judgeExecutor(
  recorded: ExecutorIdentity,
  own: ExecutorIdentity,
  options: {
    readonly activeInProcess: boolean;
    readonly confirmStopped?: boolean;
    readonly table?: ProcessTable;
  },
): Promise<LeaseVerdict> {
  const state = await proveExecutorState(recorded, own, options.table ?? nodeProcessTable);
  if (state === 'self') {
    return options.activeInProcess ? { kind: 'held', state } : { kind: 'takeover', proof: state };
  }
  if (state === 'dead') return { kind: 'takeover', proof: state };
  // An operator assertion never overrides a process that is provably running.
  if (options.confirmStopped === true && state === 'unknown') {
    return { kind: 'takeover', proof: 'asserted' };
  }
  return { kind: 'held', state };
}
