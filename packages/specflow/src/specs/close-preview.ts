import {
  CloseOperationError,
  closePreviewCheckoutBlocker,
  previewPublicCloseOperation,
  type CloseRepositoryBlocker,
  type IntegrationBranchFact,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';

import { ReportedFailure } from '../exit-code';

type PreviewRequest = Parameters<typeof previewPublicCloseOperation>[1];

/** The human line of a Close that archives without Git (Git is off for the project). */
export const ARCHIVED_WITHOUT_GIT =
  'Without Git (Git is off for this project): the Specification is archived in place; nothing is committed or merged.';

/** The human lines of a preview that archives without Git, by the checkout it archives in. */
export function withoutGitLines(checkout: 'primary' | 'linked'): string[] {
  return checkout === 'linked'
    ? [
        ARCHIVED_WITHOUT_GIT,
        'The archive stays uncommitted in the linked worktree: commit it there before closing the worktree with Git on.',
      ]
    : [ARCHIVED_WITHOUT_GIT];
}

/**
 * `specs close --preview` and `specs worktree close --preview`: the read-only plan, refused with
 * `CLOSE_BLOCKED` exactly where Close would refuse, listing the workflow blockers and the agent
 * Session blocker (`session-turn-running`, by Close's own checkout rule) together.
 */
export async function previewCloseForCli(
  engine: SpecFlowEngine,
  request: PreviewRequest,
  ports: {
    readonly preview?: typeof previewPublicCloseOperation;
    readonly occupancy?: typeof closePreviewCheckoutBlocker;
  } = {},
) {
  const occupancy = await (ports.occupancy ?? closePreviewCheckoutBlocker)(engine, request);
  let plan: Awaited<ReturnType<typeof previewPublicCloseOperation>>;
  try {
    plan = await (ports.preview ?? previewPublicCloseOperation)(engine, request);
  } catch (error) {
    if (occupancy && error instanceof CloseOperationError && error.code === 'CLOSE_BLOCKED') {
      throw new CloseOperationError('CLOSE_BLOCKED', error.message, {
        blockers: [...error.blockers, occupancy],
      });
    }

    throw error;
  }

  if (occupancy) {
    throw new CloseOperationError('CLOSE_BLOCKED', occupancy.message, { blockers: [occupancy] });
  }

  return plan;
}

type MissingTarget = Extract<CloseRepositoryBlocker, { kind: 'integration-target-missing' }>;

const FACT_TEXT: Readonly<Record<IntegrationBranchFact, (remote?: string) => string>> = {
  'remote-default': (remote) => 'default branch of remote ' + (remote ?? 'unknown'),
  'started-from': () => "this worktree's branch started from it",
  'primary-checkout': () => 'checked out in the main folder',
};

/** What closing does with the Specification, by its checkout. */
function closeEffect(blocker: MissingTarget): string {
  return blocker.sourceCheckout === 'primary'
    ? 'Closing archives the Specification directly on the integration branch in the main folder (nothing to merge).'
    : "Closing merges this worktree's branch into the integration branch.";
}

/** What choosing `branch` would do, by the Specification's checkout. */
function choiceEffect(blocker: MissingTarget, branch: string): string {
  return blocker.sourceCheckout === 'primary'
    ? 'archives on ' + branch + ' (main folder; nothing to merge)'
    : 'merges into ' + branch;
}

/**
 * The text of a missing integration branch: why it is missing, what closing does, the candidates
 * with the facts that make them one, and the other local branches. It names facts, never a
 * default: nothing is chosen for the user.
 */
export function integrationTargetMissingLines(blocker: MissingTarget): string[] {
  const lines = [
    'No integration branch is configured: git.integrationTargetBranch in .nevo/config.yaml names none. ' +
      closeEffect(blocker),
  ];
  if (blocker.candidates.length === 0 && blocker.otherBranches.length === 0) {
    lines.push(
      'No local branch can receive it. Create the integration branch in the repository, then preview again.',
    );

    return lines;
  }

  if (blocker.candidates.length > 0) {
    lines.push('Candidates (none is chosen for you):');
    for (const candidate of blocker.candidates) {
      lines.push(
        '  ' +
          candidate.branch +
          ': ' +
          candidate.facts.map((fact) => FACT_TEXT[fact](candidate.remote)).join('; ') +
          '; ' +
          choiceEffect(blocker, candidate.branch),
      );
    }
  }

  if (blocker.otherBranches.length > 0) {
    const more = blocker.otherBranchCount - blocker.otherBranches.length;
    lines.push(
      (blocker.candidates.length > 0 ? 'Other local branches: ' : 'Local branches: ') +
        blocker.otherBranches.join(', ') +
        (more > 0 ? ` and ${more} more` : ''),
    );
  }

  lines.push(
    'Choose the branch, set git.integrationTargetBranch in .nevo/config.yaml, then preview again.',
  );

  return lines;
}

/**
 * A Close preview refused for a missing integration branch: the refusal and the candidates are
 * printed (stderr; `--json` also prints `{error}` on stdout) and the command fails as reported. Any
 * other error is left to the caller.
 */
export async function reportingMissingIntegrationTarget<T>(
  output: { readonly stdout: (line: string) => void; readonly stderr: (line: string) => void },
  json: boolean | undefined,
  body: () => Promise<T>,
): Promise<T> {
  try {
    return await body();
  } catch (error) {
    const missing =
      error instanceof CloseOperationError
        ? error.repository.find(
            (blocker): blocker is MissingTarget => blocker.kind === 'integration-target-missing',
          )
        : undefined;
    if (!(error instanceof CloseOperationError) || !missing) {
      throw error;
    }

    output.stderr(error.code + ': ' + error.message);
    for (const line of integrationTargetMissingLines(missing)) {
      output.stderr(line);
    }

    if (json) {
      output.stdout(
        JSON.stringify({
          error: { code: error.code, message: error.message, repository: error.repository },
        }),
      );
    }

    throw new ReportedFailure(error.message, 1);
  }
}
