import type {
  ManualCommitCommandResult,
  ManualCommitScope,
  UncommittedScopeView,
} from '@nevo/specflow-engine';

/** The stable JSON of a manual commit: the facts of the HTTP answer plus the scope that was committed. */
export function commitResultJson(
  result: ManualCommitCommandResult,
  scope: ManualCommitScope,
  specId: string | undefined,
) {
  return {
    operationId: result.operationId,
    scope,
    ...(specId !== undefined ? { specId } : {}),
    commit: result.commit,
    paths: [...result.paths],
    remaining: result.remaining,
    replayed: result.replayed,
  };
}

export function commitResultLines(result: ManualCommitCommandResult): string[] {
  const lines: string[] = [];
  if (result.commit.state === 'committed' && result.commit.sha !== undefined) {
    const files = result.paths.length === 1 ? '1 file' : `${String(result.paths.length)} files`;
    lines.push(`Committed ${result.commit.sha.slice(0, 12)} (${files})`);
    for (const path of result.paths) lines.push(`  ${path}`);
  } else {
    lines.push('Nothing to commit: every path already equals HEAD.');
  }
  lines.push(`Remaining uncommitted: ${String(result.remaining.entries)}`);
  if (result.replayed) lines.push('(the result of an earlier request with this operation id)');
  return lines;
}

export function uncommittedLines(view: UncommittedScopeView): string[] {
  const lines = [
    `Scope: ${view.scope}`,
    `Commit policy: documents ${view.policy.documents} (${view.policy.source})`,
    `Ledger revision: ${view.ledgerRevision}`,
    `Uncommitted: ${String(view.entries.length)} path(s)`,
  ];
  for (const entry of view.entries) {
    lines.push(
      `  ${entry.path}  ${entry.reason}  ${String(entry.operations)} operation(s)  [${entry.owner}]`,
    );
  }
  const { pending, failed, recoveryRequired } = view.queue;
  lines.push(
    `Queue: ${String(pending)} pending, ${String(failed)} failed, ${String(recoveryRequired)} need recovery`,
  );
  if (view.entries.length > 0 && pending + failed + recoveryRequired > 0) {
    lines.push(
      'A manual commit is unavailable until the queue is at rest: flush, retry or abandon the ' +
        'commits above with "nevo-specflow specs documents".',
    );
  }
  return lines;
}
