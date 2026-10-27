import { DocumentError } from '@nevo/specflow-engine';

import { ReportedFailure } from '../exit-code';

export interface DocumentsOutput {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

/** What a refusal tells the operator or the agent, in the shape `--json` prints under `error`. */
export interface FailureReport {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
  readonly hint?: string;
}

const RECOVER_HINT =
  'Inspect it with "nevo-specflow specs documents status <operationId>", then run ' +
  '"nevo-specflow specs documents recover <operationId> --resume|--adopt|--abandon". When no process of ' +
  'this project is running and the executor cannot be proven dead, add --confirmed-stopped; ' +
  '"nevo-specflow specs documents recover --confirmed-stopped" takes over the whole queue.';

/** The next step for a refusal, or undefined when the message says it all. */
export function hintFor(error: DocumentError): string | undefined {
  const details = error.details;
  switch (error.code) {
    case 'SPEC_BUSY':
      if (details?.cause === 'recovery-required') return RECOVER_HINT;
      if (details?.cause === 'commit-in-progress' && details.operationId !== undefined) {
        return (
          `Manual commit ${details.operationId} holds this checkout. Retry shortly; when it never ends ` +
          `(its process was killed) run "nevo-specflow specs documents recover ${details.operationId} --resume" ` +
          '(add --confirmed-stopped when no process of this project is running).'
        );
      }
      return details?.retryAfterMs !== undefined
        ? `Retry in ${details.retryAfterMs} ms (same --operation-id is safe).`
        : 'Retry shortly (the same --operation-id is safe).';
    case 'DOCUMENT_COMMITS_PENDING':
      if (details?.cause === 'commit-uncommitted') {
        return (
          'The Engine left changes uncommitted (auto-commit is off, or a commit was abandoned). ' +
          'Commit exactly those with "nevo-specflow commit --spec <slug|id>" (see them with ' +
          '"nevo-specflow commit status --spec <slug|id>"), or commit them with Git; the Engine ' +
          'drops them from its list on the next flush.'
        );
      }
      return (
        'Run "nevo-specflow specs documents flush"; retry or abandon failed commits with ' +
        '"specs documents retry|abandon <operationId>".'
      );
    case 'DOCUMENT_UNCOMMITTED_LIMIT':
      return (
        'Commit the uncommitted changes first with "nevo-specflow commit --spec <slug|id>" ' +
        '(see them with "nevo-specflow commit status --spec <slug|id>").'
      );
    case 'MANUAL_COMMIT_UNAVAILABLE':
      if (details?.cause === 'queue-not-empty') {
        return (
          'Document commits of this scope are pending, failed or need recovery. Run ' +
          '"nevo-specflow specs documents flush", retry or abandon the failed ones ' +
          '("specs documents retry|abandon <operationId>"), then repeat.'
        );
      }
      if (details?.cause === 'git-disabled')
        return 'Git is disabled for this project: nothing can be committed.';
      return 'Nothing is uncommitted in this scope. See "nevo-specflow commit status".';
    case 'MANUAL_COMMIT_CONFLICT':
      if (details?.cause === 'branch-changed') {
        return 'Switch back to the branch the changes were made on (see "commit status"), then repeat.';
      }
      return (
        'Some listed files were edited after the Engine wrote them. Review them: commit them with Git, ' +
        'or restore the Engine content or HEAD; then repeat. "nevo-specflow specs documents resolve ' +
        '<operationId>" drops entries you dealt with by hand.'
      );
    case 'MANUAL_COMMIT_SUBSET_INVALID':
      return details?.cause === 'path-not-in-ledger'
        ? 'Name only paths listed by "nevo-specflow commit status".'
        : 'The paths split an operation that wrote them together: add every listed path with --path, or commit all.';
    case 'MANUAL_COMMIT_STALE':
      return 'The list changed. Read it again with "nevo-specflow commit status", then repeat.';
    case 'MANUAL_COMMIT_MESSAGE_INVALID':
      return (
        'The first line is 1-100 characters, the rest at most 2000, and the text holds no NUL ' +
        'character. Repeat -m for more paragraphs.'
      );
    case 'MANUAL_COMMIT_RECOVERY_REQUIRED':
      return RECOVER_HINT;
    case 'DOCUMENT_RECOVERY_REQUIRED':
      return RECOVER_HINT;
    case 'DOCUMENT_OPERATION_STATE_INVALID':
      return 'Read the operation with "nevo-specflow specs documents status <operationId>".';
    case 'DOCUMENT_REVISION_CONFLICT':
      return 'The document changed. Read it again with "specs documents list" and repeat with the current --expected-revision.';
    case 'CATALOGUE_STALE':
      return 'The definitions changed; repeat the command (the revision is read again).';
    case 'DEFINITIONS_MISSING':
      return 'Run "nevo-specflow definitions install".';
    case 'ARCHETYPE_UNKNOWN':
      return 'Check the definitions with "nevo-specflow definitions list".';
    case 'SPEC_MANIFEST_DIRTY':
      return 'Commit or discard the pending change of specification.yaml, then repeat.';
    case 'BRANCH_PROTECTED':
    case 'COMMIT_BLOCKED':
      return 'Switch to a branch the project allows, then repeat.';
    default:
      return undefined;
  }
}

export function reportOf(error: DocumentError): FailureReport {
  const hint = hintFor(error);
  return {
    code: error.code,
    message: error.message,
    ...(error.details !== undefined ? { details: error.details } : {}),
    ...(hint !== undefined ? { hint } : {}),
  };
}

/**
 * Runs a command body. A refusal of the documents layer (a {@link DocumentError}) is printed to
 * stderr as `<CODE>: message`, with its cause and a hint, and ends the command with exit code 1;
 * with `--json`, stdout also carries `{ "error": { code, message, details?, hint? } }`. Any other
 * error is not a domain refusal and propagates to the executable boundary.
 */
export async function reportingRefusals<T>(
  output: DocumentsOutput,
  json: boolean | undefined,
  body: () => Promise<T>,
): Promise<T> {
  try {
    return await body();
  } catch (error) {
    if (!(error instanceof DocumentError)) throw error;
    const report = reportOf(error);
    const cause = error.details?.cause;
    output.stderr(`${report.code}: ${report.message}${cause !== undefined ? ` (${cause})` : ''}`);
    if (report.hint !== undefined) output.stderr(`Hint: ${report.hint}`);
    if (json) output.stdout(JSON.stringify({ error: report }));
    throw new ReportedFailure(report.message, 1);
  }
}
