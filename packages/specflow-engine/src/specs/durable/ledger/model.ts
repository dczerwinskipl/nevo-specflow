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
 * Largest record file, as published (indented JSON, like the text `encodeLedgerRecord` measures). Worst case
 * per entry: a 1024-character path of three-byte characters (3072 bytes), 50 operation ids (about 2300
 * bytes) and about 400 bytes of keys, hash and times, so 200 entries are about 1.15 MB. The bound is 2 MiB:
 * a record the path-count limit admits is always writable (ADR 0018 names 64 KiB, which cannot hold it).
 */
export const LEDGER_MAX_BYTES = 2 * 1024 * 1024;
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
