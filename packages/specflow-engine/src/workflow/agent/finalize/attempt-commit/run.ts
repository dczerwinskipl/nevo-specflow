import type { SpecFlowEngine } from '../../../../application';
import {
  manualCommit,
  recoverManualCommitOperation,
  type ManualCommitCommandOptions,
  type ManualCommitCommandResult,
} from '../../../../specs/documents/manual-commit';
import { resolveSpecification } from '../../../../specs/discovery';
import { readLedgerRecord } from '../../../../specs/durable';
import { mintAttemptCommitAuthority } from '../../../../specs/uncommitted/attempts';
import { errorOfFailedJournal, findManualCommitJournal } from '../../../../specs/manual-commit';
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

/** Seams of the manual commit the attempt commit runs (tests: its hooks, to stop at a cut point). */
export type AttemptCommitOptions = Pick<ManualCommitCommandOptions, 'deps' | 'commitDeadlineMs'>;

/**
 * The attempt's one Engine-owned commit (D15), made through the manual commit (ADR 0018: its lease,
 * claims, journal, verification and prune) on the branch the checkout is on, whatever the documents
 * commit policy says. It holds exactly:
 *
 * - the ledger entries of the Specification that only the attempt's Turns made (their durable
 *   authors, `ledgerAuthorsOf`: documents, Tasks, execution state; the start is its first Turn's),
 * - the declared paths, each only while its content is the hash recorded when the step state was
 *   published.
 *
 * An entry the attempt never touched stays out, another author's included. An entry the attempt
 * changed together with someone else (`ATTEMPT_COMMIT_MIXED_AUTHORS`; unreachable through SpecFlow's
 * own actions: an agent's write never builds on another author's uncommitted change, and while the
 * attempt's commit waits every workflow write of the Specification and every other document write to
 * a path the commit takes are refused), a declared path that was
 * never hashed (`ATTEMPT_COMMIT_UNATTRIBUTABLE`) or a path whose content changed since
 * (`MANUAL_COMMIT_CONFLICT`) refuses the whole commit, naming it: nothing is committed. With
 * automatic commits on, the document queue of the Specification is drained first (the manual
 * commit's admission). Never inside a lock section.
 *
 * Its operation is the post action's run id. A run repeated after a crash (the run not recorded)
 * finds that manual commit and completes or replays it from its own journal, never from the ledger
 * it may already have pruned; a retry after a recorded run is a new operation. A failure is
 * reported, never thrown.
 */
export async function commitAgentAttempt(
  engine: SpecFlowEngine,
  journal: AgentAttemptJournal,
  action: AgentPostActionRecord,
  options: AttemptCommitOptions = {},
): Promise<readonly PostActionResult[]> {
  try {
    const runId = agentPostActionRunId(action);
    const earlier = await findManualCommitJournal(engine.context, runId);
    if (earlier !== undefined) {
      if (earlier.stage === 'failed') {
        throw errorOfFailedJournal(earlier);
      }

      return completed(await recoverManualCommitOperation(engine, runId, 'resume', options));
    }

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
    if (ledger.mixed.length > 0) {
      throw new AttemptCommitRefusal(
        'ATTEMPT_COMMIT_MIXED_AUTHORS',
        `The agent's uncommitted work shares files with someone else's uncommitted change: ` +
          `${named(ledger.mixed)}. SpecFlow cannot commit one without the other, so nothing was ` +
          "committed. While an attempt's commit waits SpecFlow refuses every change of its " +
          "files but the agent's own, so these files were changed some other way.",
      );
    }

    const declared = action.declared ?? [];
    const unhashed = unhashedDeclared(declared);
    if (unhashed.length > 0) {
      throw new AttemptCommitRefusal(
        'ATTEMPT_COMMIT_UNATTRIBUTABLE',
        `SpecFlow cannot prove these files are the agent's: ${named(unhashed)}. ` +
          'Commit them with Git yourself.',
      );
    }

    if (ledger.paths.length === 0 && declared.length === 0) {
      return [{ action: ACTION, status: 'skipped', reason: 'nothing-to-commit' }];
    }

    return completed(
      await manualCommit(
        engine,
        {
          operationId: runId,
          scope: 'specification',
          specId,
          paths: ledger.paths,
          declared,
          authorsJudged: true,
          composed: attemptCommitMessage(journal, action.stepTitle, found.specification.slug),
        },
        // The one commit exempt from this attempt's hold of its paths: its own.
        { ...options, attemptCommit: mintAttemptCommitAuthority(journal.operationId) },
      ),
    );
  } catch (error) {
    const code =
      error instanceof Error && 'code' in error && typeof error.code === 'string'
        ? error.code
        : 'POST_ACTION_FAILED';

    const message =
      error instanceof Error ? error.message : 'The commit of the agent attempt failed.';
    const paths = pathsOf(error);

    return [
      {
        action: ACTION,
        status: 'failed',
        code,
        // The paths a refusal names (an edit since the step was published, for example).
        message: paths.length > 0 ? `${message} (${named(paths)})` : message,
      },
    ];
  }
}

/** The paths a refusal names in its details, if any. */
function pathsOf(error: unknown): readonly string[] {
  const details =
    error instanceof Error && 'details' in error
      ? (error as { details?: unknown }).details
      : undefined;
  const paths =
    typeof details === 'object' && details !== null && 'paths' in details
      ? (details as { paths?: unknown }).paths
      : undefined;

  return Array.isArray(paths)
    ? paths.filter((path): path is string => typeof path === 'string')
    : [];
}

function completed(result: ManualCommitCommandResult): readonly PostActionResult[] {
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
}

/** The post-action runner of an opened Engine: the attempt commit. */
export function attemptCommitRunner(
  engine: SpecFlowEngine,
  options: AttemptCommitOptions = {},
): AgentPostActionRunner {
  return {
    run(journal, action) {
      return journal.proposal?.state === 'finalized'
        ? commitAgentAttempt(engine, journal, action, options)
        : Promise.resolve([]);
    },
  };
}
