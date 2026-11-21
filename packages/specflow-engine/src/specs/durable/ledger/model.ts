/**
 * The uncommitted-changes ledger (ADR 0018): the durable, owner-keyed record of what the Engine wrote
 * to a checkout and did not commit. Generic: the documents layer is its first user, definitions and,
 * later, tasks and reviews are others. Nothing here knows an operation kind or Git.
 */

/** Directory of the ledger below the Project state root; one sub-directory per checkout. */
export const LEDGER_RELATIVE_DIR = 'engine/operations/ledger';

/** The only ledger format this Engine writes and interprets. */
export const LEDGER_VERSION = 1;

/** Distinct paths one record holds. A write that would add one more is refused before it writes. */
export const LEDGER_MAX_PATHS = 200;
/** Operation ids kept per path (the newest); `operationCount` keeps the true number. */
export const LEDGER_MAX_OPERATION_IDS = 50;
/**
 * Distinct agent Turns {@link LedgerAuthors} names per path; one more makes the entry `unattributed`
 * (fail closed: its authors are no longer known in full).
 */
export const LEDGER_MAX_AUTHORS = 100;
/**
 * Largest record file, as published (indented JSON, like the text `encodeLedgerRecord` measures). Worst case
 * per entry: a 1024-character path of three-byte characters (3072 bytes), 50 operation ids (about 2300
 * bytes), their 50 executions (about 5500 bytes), 100 authors (about 4300 bytes) and about 400 bytes of
 * keys, hash and times, so 200 entries are about 3.2 MB. The bound is 4 MiB: a record the path-count
 * limit admits is always writable (ADR 0018 names 64 KiB, which cannot hold it).
 */
export const LEDGER_MAX_BYTES = 4 * 1024 * 1024;
/** Longest branch name a record pins; a write on a longer one is refused before anything is written. */
export const LEDGER_BRANCH_MAX_CHARACTERS = 240;
/** Most checkouts and most records per checkout a listing reads. */
export const LEDGER_LISTING_MAX_WORKSPACES = 64;
export const LEDGER_LISTING_MAX_RECORDS = 64;

/** Why a path is uncommitted: the policy is off, or its batch was abandoned. */
export const LEDGER_REASONS = ['auto-commit-off', 'abandoned'] as const;
export type LedgerReason = (typeof LEDGER_REASONS)[number];

/** Who owns the paths of a record. `task` and `review` join when those capabilities exist. */
export type LedgerOwner =
  { readonly kind: 'specification'; readonly id: string } | { readonly kind: 'definitions' };

export interface LedgerEntry {
  /** Checkout-relative path with `/` separators; exactly one entry per path. */
  readonly path: string;
  /** sha256 of the content the Engine left on disk; `null` when the Engine removed the file. */
  readonly postSha256: string | null;
  /** Operations that changed the path, oldest first, at most {@link LEDGER_MAX_OPERATION_IDS}. */
  readonly operationIds: readonly string[];
  /** How many operations changed the path (>= `operationIds.length`). */
  readonly operationCount: number;
  readonly recordedAt: string;
  readonly reason: LedgerReason;
  /**
   * The operations of `operationIds` an agent Turn made, with that Turn's execution claim (its
   * Runtime invocation): who authored them, read back from the claim's durable intent. Absent when
   * none did.
   */
  readonly executions?: readonly LedgerExecution[];
  /**
   * Who made EVERY operation of the path, merged on each record and never truncated (unlike
   * `operationIds`): the agent Turns (`executions`, sorted, distinct) and whether any operation was
   * made without one (`unattributed`: an owner, a tool, or more Turns than are named). Absent in a
   * record written before it existed: {@link ledgerAuthorsOf} derives it then.
   */
  readonly authors?: LedgerAuthors;
}

export interface LedgerExecution {
  readonly operationId: string;
  readonly executionId: string;
}

export interface LedgerAuthors {
  readonly executions: readonly string[];
  readonly unattributed?: true;
}

/**
 * The authors of an entry: its own `authors`, else what its kept operations say (`unattributed`
 * when one of them names no Turn, or when it forgot older operations).
 */
export function ledgerAuthorsOf(entry: LedgerEntry): LedgerAuthors {
  if (entry.authors !== undefined) {
    return entry.authors;
  }

  const executions = new Map(
    (entry.executions ?? []).map((execution) => [execution.operationId, execution.executionId]),
  );
  const unattributed =
    entry.operationCount > entry.operationIds.length ||
    entry.operationIds.some((id) => !executions.has(id));

  return {
    executions: [...new Set(executions.values())].sort(),
    ...(unattributed ? { unattributed: true as const } : {}),
  };
}

/** `authors` with one more operation, made by the Turn `executionId` or by none. */
export function withLedgerAuthor(
  authors: LedgerAuthors | undefined,
  executionId: string | undefined,
): LedgerAuthors {
  const executions = new Set(authors?.executions ?? []);
  let unattributed = authors?.unattributed === true || executionId === undefined;
  if (executionId !== undefined && !executions.has(executionId)) {
    if (executions.size >= LEDGER_MAX_AUTHORS) {
      unattributed = true;
    } else {
      executions.add(executionId);
    }
  }

  return {
    executions: [...executions].sort(),
    ...(unattributed ? { unattributed: true as const } : {}),
  };
}

/** One durable record per (checkout, owner): `engine/operations/ledger/<workspaceId>/<ownerKey>.json`. */
export interface LedgerRecord {
  readonly version: typeof LEDGER_VERSION;
  readonly projectId: string;
  readonly workspaceId: string;
  /** The checkout the paths belong to. */
  readonly workspaceRoot: string;
  readonly owner: LedgerOwner;
  /** The branch checked out when the first entry was recorded; `null` on a detached HEAD or without Git. */
  readonly branch: string | null;
  /** HEAD when the first entry was recorded; `null` on an unborn branch or without Git. */
  readonly head: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly entries: readonly LedgerEntry[];
}

/** A write that would add more distinct paths than a record holds. */
export class LedgerLimitError extends Error {
  readonly limit = LEDGER_MAX_PATHS;

  constructor() {
    super('The uncommitted-changes ledger is full; commit the pending changes first.');
    this.name = 'LedgerLimitError';
  }
}

/** A record that is corrupt, redirected, oversize or of another format. Fail closed. */
export class LedgerCorruptError extends Error {
  constructor() {
    super('An uncommitted-changes ledger record is corrupt. Operator recovery is required.');
    this.name = 'LedgerCorruptError';
  }
}

/** The file name stem of an owner: `definitions` or `specification-<id>`. */
export function ledgerOwnerKey(owner: LedgerOwner): string {
  return owner.kind === 'definitions' ? 'definitions' : 'specification-' + owner.id;
}

const SPEC_OWNER =
  /^specification-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/u;

/** The owner a file name stem names, or `undefined` for a name that is not a ledger record. */
export function ledgerOwnerOfKey(key: string): LedgerOwner | undefined {
  if (key === 'definitions') {
    return { kind: 'definitions' };
  }

  const match = SPEC_OWNER.exec(key);

  return match?.[1] !== undefined ? { kind: 'specification', id: match[1] } : undefined;
}
