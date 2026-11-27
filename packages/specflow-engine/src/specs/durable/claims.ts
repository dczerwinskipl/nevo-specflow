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

/**
 * `OWNED_CLAIM_NOT_HELD`: the write names an owned execution that has no unsettled claim (none was
 * admitted, or it settled): the Turn has ended or never ran, so the write is refused, never
 * admitted as an unclaimed one.
 */
export type SharedResourceErrorCode =
  'RESOURCE_CONFLICT' | 'RESOURCE_JOURNAL_CORRUPT' | 'OWNED_CLAIM_NOT_HELD';

export class SharedResourceError extends Error {
  readonly code: SharedResourceErrorCode;
  /** The claim that conflicts (`RESOURCE_CONFLICT`); absent for a corrupt journal. */
  readonly holder: ClaimHolder | undefined;

  constructor(code: SharedResourceErrorCode, message: string, holder?: ClaimHolder) {
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
  /**
   * The native agent execution the caller acts for, named in-process by the trusted host (never
   * taken from a request): its claim is the caller's own (see {@link OwnedExecutionClaim}). Every
   * other unsettled writer still conflicts.
   */
  readonly ownedExecution?: OwnedExecutionClaim;
}

/**
 * The owned-claim admission of an agent execution (D11), in one of two forms:
 *
 * - `turn`: a write of the running Turn (the broker): admitted only while the claim is `dispatched`;
 *   an `admitted` claim has dispatched nothing yet and an `unknown` one belongs to a Turn that ended.
 * - `finalize`: the finalize section of the attempt (the step state published together with the
 *   claim settlement): admitted in any unsettled phase, `unknown` included. Only the Engine's own
 *   finalize builds this form, inside that lock section; no host option yields it.
 */
export interface OwnedExecutionClaim {
  /** The execution claim's `operationId` (the Runtime invocation id). */
  readonly operationId: string;
  readonly form: 'turn' | 'finalize';
}

/**
 * What a trusted host names for a write of an agent Turn (the broker): the execution claim the write
 * belongs to. It always becomes the `turn` form; the `finalize` form is the Engine's own.
 */
export interface OwnedExecution {
  readonly operationId: string;
  /**
   * The agent the write is made for, built by the trusted host from the Turn's binding (never from
   * a request). A document write records it, with `operationId`, on its journal; the ledger entries
   * it leaves name `operationId` as their execution.
   */
  readonly actor?: AgentWriteActor;
}

/** An agent as a durable write records it: the shape of the workflow's `AgentActor`. */
export interface AgentWriteActor {
  readonly class: 'agent';
  readonly details: {
    readonly archetype?: string;
    readonly provider: string;
    readonly providerTitle?: string;
    readonly model?: string;
    readonly modelTitle?: string;
    readonly sessionId?: string;
  };
}

/** The `turn` form of a host's {@link OwnedExecution}, as the claim check takes it. */
export function ownedTurnOf(owned: OwnedExecution | undefined): {
  readonly ownedExecution?: OwnedExecutionClaim;
} {
  return owned === undefined
    ? {}
    : { ownedExecution: { operationId: owned.operationId, form: 'turn' } };
}

/** Whether `self` names the unsettled execution claim `operationId` in `phase` as its own. */
export function ownsExecutionClaim(
  self: { readonly ownedExecution?: OwnedExecutionClaim } | undefined,
  operationId: string,
  phase: 'admitted' | 'dispatched' | 'unknown',
): boolean {
  const owned = self?.ownedExecution;
  if (owned?.operationId !== operationId) {
    return false;
  }

  return owned.form === 'finalize' || phase === 'dispatched';
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
