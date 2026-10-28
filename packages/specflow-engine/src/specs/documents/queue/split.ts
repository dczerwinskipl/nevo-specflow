import { foldPathKey } from '../../document-rules/document-paths';

/** A member of a batch with the checkout-relative paths of its plan. */
export interface SplitMember {
  readonly operationId: string;
  readonly paths: readonly string[];
}

export interface BatchSplit {
  /** Members that cannot be committed now, in batch order. */
  readonly failed: readonly string[];
  /** Members that can be committed without them, in batch order. */
  readonly rest: readonly string[];
}

/**
 * Split-and-retry (ADR 0016 decision 13): when only some paths of a batch fail, the members that
 * touch a failing path fail, and so does every member that shares a path with a failed member
 * (closed transitively): the commit holds the final state of a path, so a path cannot be committed
 * for one member and not for another that wrote it. Everything else is committed without them.
 *
 * Returns `undefined` when nothing would be left to commit, or when no member touches a failing
 * path: such a batch is not split, it fails whole.
 */
export function splitBatch(
  members: readonly SplitMember[],
  failingPaths: readonly string[],
): BatchSplit | undefined {
  const failedKeys = new Set(failingPaths.map(foldPathKey));
  const failed = new Set<string>();
  for (let grew = true; grew;) {
    grew = false;
    for (const member of members) {
      if (failed.has(member.operationId)) continue;
      if (member.paths.some((path) => failedKeys.has(foldPathKey(path)))) {
        failed.add(member.operationId);
        for (const path of member.paths) failedKeys.add(foldPathKey(path));
        grew = true;
      }
    }
  }
  const ids = members.map((member) => member.operationId);
  const rest = ids.filter((id) => !failed.has(id));
  if (failed.size === 0 || rest.length === 0) return undefined;
  return { failed: ids.filter((id) => failed.has(id)), rest };
}
