import type { ResolvedProjectHome } from '../../../project/home/home';
import { LedgerCorruptError, readLedgerRecord, readPayload } from '../../durable';
import { documentChangeError } from '../changes/errors';
import { DOCUMENT_CHANGE_JOURNAL_KIND } from '../changes/journal/kind';
import type { DocumentChangeJournal } from '../changes/journal/model';
import { DOCUMENT_CHANGE_STAGE_FACTS, isBarrierStage } from '../changes/journal/stages';
import { decodePlanWithEvidence } from '../changes/plan/codec';
import { listDocumentChangeJournals } from './journal-store';

/**
 * What the manifest on disk is judged against, in this order (ADR 0018 decision 7): the post-image of
 * the latest non-terminal operation that changed it; else the post-image the uncommitted-changes
 * ledger holds for it (auto-commit off, or an abandoned batch); else `HEAD` (only where Git is enabled).
 */
export type ManifestBaseline =
  | {
      readonly kind: 'operation';
      readonly operationId: string;
      readonly sequence: number;
      /** sha256 of the manifest the operation leaves behind. */
      readonly postSha256: string;
      /** The operation is still writing its files: the manifest on disk is changing. */
      readonly writing: boolean;
    }
  | {
      readonly kind: 'ledger';
      /** sha256 of the manifest the Engine left uncommitted; `null` if it recorded the file as removed. */
      readonly postSha256: string | null;
    }
  | { readonly kind: 'head' };

/** Actions that never change the registry (their planners produce no manifest path). */
const NEVER_CHANGES_MANIFEST = new Set<string>(['save', 'save-all']);

/**
 * The latest (highest `sequence`) non-terminal operation of this Specification in this checkout that
 * changed the manifest. Every non-terminal stage counts: `queued`, `committing`, `commit-failed`,
 * and `recovery-required` as much as one still being written. Reads the plan file of the
 * candidates only (saves are skipped without a read); an unreadable plan fails closed.
 */
export async function findManifestBaseline(
  context: ResolvedProjectHome,
  target: { readonly workspaceId: string; readonly specId: string; readonly manifestPath: string },
  journals?: readonly DocumentChangeJournal[],
): Promise<ManifestBaseline> {
  const all = journals ?? (await listDocumentChangeJournals(context));
  const candidates = all
    .filter(
      (journal) =>
        journal.workspaceId === target.workspaceId &&
        journal.specId === target.specId &&
        DOCUMENT_CHANGE_STAGE_FACTS[journal.stage].active &&
        !NEVER_CHANGES_MANIFEST.has(journal.action),
    )
    .sort((left, right) => right.sequence - left.sequence);
  for (const journal of candidates) {
    const text = await readPayload(
      context,
      DOCUMENT_CHANGE_JOURNAL_KIND,
      journal.operationId,
      journal.plan,
    );
    const plan = decodePlanWithEvidence(text, journal.plan);
    const manifest = plan.paths.find((path) => path.path === target.manifestPath);
    if (manifest?.post == null) continue;
    return {
      kind: 'operation',
      operationId: journal.operationId,
      sequence: journal.sequence,
      postSha256: manifest.post.sha256,
      writing: isBarrierStage(journal.stage, journal.recoveryPhase),
    };
  }
  const entry = await ledgerEntryOf(context, target);
  if (entry !== undefined) return { kind: 'ledger', postSha256: entry.postSha256 };
  return { kind: 'head' };
}

async function ledgerEntryOf(
  context: ResolvedProjectHome,
  target: { readonly workspaceId: string; readonly specId: string; readonly manifestPath: string },
): Promise<{ readonly postSha256: string | null } | undefined> {
  try {
    const record = await readLedgerRecord(context, target.workspaceId, {
      kind: 'specification',
      id: target.specId,
    });
    return record?.entries.find((entry) => entry.path === target.manifestPath);
  } catch (error) {
    // A ledger that cannot be read cannot vouch for the manifest: fail closed.
    if (error instanceof LedgerCorruptError) {
      throw documentChangeError('journal-corrupt', 'The uncommitted-changes ledger is corrupt.');
    }
    throw error;
  }
}

export interface ManifestJudgement {
  /** sha256 of the manifest bytes on disk. */
  readonly diskSha256: string;
  readonly baseline: ManifestBaseline;
  /**
   * Whether the manifest equals `HEAD` (attribute-aware blob ids). Needed for the `head` baseline and
   * as the way out of a stale `ledger` one; `undefined` when Git is disabled.
   */
  readonly cleanInGit?: boolean;
}

/**
 * `SPEC_MANIFEST_DIRTY` for a registry-changing request. Pure. The manifest on disk must equal the
 * post-image of the latest non-terminal operation that changed it, else the ledger's post-image, or be
 * clean in Git. An operation
 * that is still writing makes the answer `SPEC_BUSY` (`manifest-changed`) instead: the manifest is
 * moving, not dirty.
 */
export function assertManifestNotDirty(judgement: ManifestJudgement): void {
  const { baseline } = judgement;
  if (baseline.kind === 'operation') {
    if (baseline.writing) {
      throw documentChangeError(
        'busy-manifest-changed',
        'The Specification registry is being changed by another operation.',
      );
    }
    if (judgement.diskSha256 !== baseline.postSha256) {
      throw documentChangeError(
        'manifest-dirty',
        'The Specification manifest was changed outside the pending operations.',
      );
    }
    return;
  }
  if (baseline.kind === 'ledger') {
    // A manifest that equals HEAD is clean whatever the ledger still says (an entry that a commit made
    // stale and no prune removed yet).
    if (judgement.diskSha256 !== baseline.postSha256 && judgement.cleanInGit !== true) {
      throw documentChangeError(
        'manifest-dirty',
        'The Specification manifest was changed outside the uncommitted changes the Engine recorded.',
      );
    }
    return;
  }
  if (baseline.kind === 'head' && judgement.cleanInGit === false) {
    throw documentChangeError(
      'manifest-dirty',
      'The Specification manifest has uncommitted changes.',
    );
  }
}
