import type { ResolvedProjectHome } from '../../project/home/home';

/** A named claim on a shared resource, for example `checkout-scoped:<workspaceId>`. */
export type MutationResource = string;

/**
 * What holds a conflicting claim, as the claim source that found it knows it: callers word their
 * refusal from it instead of guessing. `external` is a native agent execution (an agent Session
 * Turn that writes); its `ownerId` is the Session id.
 */
export type ClaimHolder =
  | {
      readonly kind: 'create' | 'close' | 'document-change' | 'manual-commit';
      readonly operationId: string;
    }
  | {
      readonly kind: 'external';
      readonly operationId: string;
      readonly ownerId: string;
      /** `unknown`: the Turn ended without a verified outcome; the Session must be resolved. */
      readonly phase: 'admitted' | 'dispatched' | 'unknown';
    };

export class SharedResourceError extends Error {
  readonly code: 'RESOURCE_CONFLICT' | 'RESOURCE_JOURNAL_CORRUPT';
  /** The claim that conflicts (`RESOURCE_CONFLICT`); absent for a corrupt journal. */
  readonly holder: ClaimHolder | undefined;

  constructor(
    code: 'RESOURCE_CONFLICT' | 'RESOURCE_JOURNAL_CORRUPT',
    message: string,
    holder?: ClaimHolder,
  ) {
    super(message);
    this.name = 'SharedResourceError';
    this.code = code;
    this.holder = holder;
  }
}

export function sortedResources(resources: readonly string[]): readonly MutationResource[] {
  return [...new Set(resources)].sort();
}

/**
 * Scoped claims coexist with each other, but conflict with the exclusive claim. A project-wide write
 * (an external execution) conflicts with every other claim.
 */
export function overlaps(left: readonly string[], right: readonly string[]): boolean {
  if (right.length > 0 && left.some((resource) => resource.startsWith('project-write:'))) {
    return true;
  }

  for (const first of left) {
    for (const second of right) {
      if (first === second) {
        if (
          first.startsWith('checkout-scoped:') ||
          first.startsWith('git-worktree-admin-scoped:')
        ) {
          continue;
        }

        return true;
      }

      for (const [exclusive, scoped] of [
        ['checkout:', 'checkout-scoped:'],
        ['git-worktree-admin:', 'git-worktree-admin-scoped:'],
      ] as const) {
        if (
          (first.startsWith(exclusive) && second === scoped + first.slice(exclusive.length)) ||
          (second.startsWith(exclusive) && first === scoped + second.slice(exclusive.length))
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

/** The operation asking for resources; its own journal never conflicts with itself. */
export interface ClaimSelf {
  readonly kind: 'create' | 'close' | 'document-change' | 'manual-commit' | 'external';
  readonly operationId: string;
}

/**
 * One kind of journal that holds resource claims: how to list its records and how to decide, for a
 * request, whether any record conflicts. `assertAvailable` throws {@link SharedResourceError}.
 */
export interface ClaimSource<TRecord> {
  readonly list: (context: ResolvedProjectHome) => Promise<readonly TRecord[]>;
  readonly assertAvailable: (
    records: readonly TRecord[],
    requested: readonly MutationResource[],
    self: ClaimSelf | undefined,
  ) => void;
}

/** A {@link ClaimSource} with its record type erased, so sources of different kinds can be checked together. */
export interface ClaimCheck {
  readonly load: (
    context: ResolvedProjectHome,
  ) => Promise<(requested: readonly MutationResource[], self: ClaimSelf | undefined) => void>;
}

export function claimCheckOf<TRecord>(source: ClaimSource<TRecord>): ClaimCheck {
  return {
    load: async (context) => {
      const records = await source.list(context);

      return (requested, self) => source.assertAvailable(records, requested, self);
    },
  };
}

/**
 * Cross-slice durable admission, invoked only while holding the short Project Home control lock.
 * Journals themselves are the claim records; there is no secondary reservation store and no
 * PID/TTL-based recovery. All sources are listed first (concurrently), then checked in the order
 * given, so the first conflict in source order is the one reported.
 */
export async function assertClaimsAvailable(
  context: ResolvedProjectHome,
  checks: readonly ClaimCheck[],
  requested: readonly MutationResource[],
  self?: ClaimSelf,
): Promise<void> {
  const asserts = await Promise.all(checks.map((check) => check.load(context)));
  for (const assertAvailable of asserts) {
    assertAvailable(requested, self);
  }
}
