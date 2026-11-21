import type { SpecFlowEngine } from '../../../../application';
import { manualCommit } from '../../../../specs/documents/manual-commit';
import { resolveSpecification } from '../../../../specs/discovery';
import { readLedgerRecord } from '../../../../specs/durable';
import { readProjectGitPolicy } from '../../../../version-control/worktrees/config';
import type { PostActionResult } from '../../../operations/post-actions';
import {
  agentPostActionRunId,
  type AgentAttemptJournal,
  type AgentPostActionRecord,
} from '../../journal/model';
import type { AgentPostActionRunner } from '../ports';
import { attemptCommitMessage } from './message';
import { attemptInvocations, selectAttemptLedgerEntries, unhashedDeclared } from './selection';

const ACTION = 'attempt-commit';

/** A refusal of the attempt commit that is not the manual commit's own. */
class AttemptCommitRefusal extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AttemptCommitRefusal';
    this.code = code;
  }
}

const named = (paths: readonly string[]): string =>
  paths.slice(0, 10).join(', ') +
  (paths.length > 10 ? ` and ${String(paths.length - 10)} more` : '');

/**
 * The attempt's one Engine-owned commit (D15), made through the manual commit (ADR 0018: its lease,
 * claims, journal, verification and prune) on the branch the checkout is on, whatever the documents
 * commit policy says. It holds exactly:
 *
 * - the ledger entries of the Specification whose every operation one of the attempt's Turns made
 *   (documents, Tasks, execution state; the attempt's start is its first Turn's), and
 * - the declared paths, each only while its content is the hash recorded when the step state was
 *   published.
 *
 * Anything else stays out, another author's ledger entry included. A path whose content changed
 * since (or a ledger entry that forgot who made its older operations) refuses the whole commit,
 * naming it: nothing is committed. With automatic commits on, the document queue of the
 * Specification is drained first (the manual commit's admission). Never inside a lock section.
 *
 * Its operation is the post action's run id: a restart repeats the same manual commit (which then
 * replays), a retry after a recorded run makes a new one. A failure is reported, never thrown.
 */
export async function commitAgentAttempt(
  engine: SpecFlowEngine,
  journal: AgentAttemptJournal,
  action: AgentPostActionRecord,
): Promise<readonly PostActionResult[]> {
  try {
    if (!(await readProjectGitPolicy(engine.context)).policy.enabled) {
      return [{ action: ACTION, status: 'skipped', reason: 'git-disabled' }];
    }

    const { specId } = journal.subject;
    const found = await resolveSpecification(engine, specId);
    if (found.status !== 'available') {
      throw new AttemptCommitRefusal(
        'SPEC_SOURCE_UNAVAILABLE',
        'The Specification source is unavailable.',
      );
    }

    if (found.workspaceId !== journal.workspaceId) {
      throw new AttemptCommitRefusal(
        'WORKFLOW_ATTEMPT_MISMATCH',
        'The Specification is no longer in the checkout the attempt worked in.',
      );
    }

    const record = await readLedgerRecord(engine.context, journal.workspaceId, {
      kind: 'specification',
      id: specId,
    });
    const ledger = selectAttemptLedgerEntries(record?.entries ?? [], attemptInvocations(journal));
    const declared = action.declared ?? [];
    const unattributable = [...ledger.unprovable, ...unhashedDeclared(declared)].sort();
    if (unattributable.length > 0) {
      throw new AttemptCommitRefusal(
        'ATTEMPT_COMMIT_UNATTRIBUTABLE',
        `SpecFlow cannot prove these paths are the agent's alone: ${named(unattributable)}. ` +
          'Commit them with Git yourself.',
      );
    }

    if (ledger.paths.length === 0 && declared.length === 0) {
      return [{ action: ACTION, status: 'skipped', reason: 'nothing-to-commit' }];
    }

    const result = await manualCommit(engine, {
      operationId: agentPostActionRunId(action),
      scope: 'specification',
      specId,
      paths: ledger.paths,
      declared,
      composed: attemptCommitMessage(journal, action.stepTitle, found.specification.slug),
    });

    return [
      {
        action: ACTION,
        status: 'completed',
        ...(result.commit.state === 'committed' || result.paths.length > 0
          ? {
              commit: {
                ...(result.commit.state === 'committed' ? { sha: result.commit.sha } : {}),
                paths: result.paths,
              },
            }
          : {}),
      },
    ];
  } catch (error) {
    const code =
      error instanceof Error && 'code' in error && typeof error.code === 'string'
        ? error.code
        : 'POST_ACTION_FAILED';

    return [
      {
        action: ACTION,
        status: 'failed',
        code,
        message: error instanceof Error ? error.message : 'The commit of the agent attempt failed.',
      },
    ];
  }
}

/** The post-action runner of an opened Engine: the attempt commit. */
export function attemptCommitRunner(engine: SpecFlowEngine): AgentPostActionRunner {
  return {
    run(journal, action) {
      return journal.proposal?.state === 'finalized'
        ? commitAgentAttempt(engine, journal, action)
        : Promise.resolve([]);
    },
  };
}
