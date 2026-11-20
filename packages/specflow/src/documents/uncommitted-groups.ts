/**
 * The Close "Uncommitted changes" report (D16): everything Close refuses because the checkout is
 * not committed, as one group with a sub-group per kind and its remedy. The Specification Close UI
 * shows the same groups and remedies (`docs/product/specflow/ui/workflow-execution.md`, "Close:
 * one Uncommitted changes group"); the CLI prints them as text and under `uncommitted` in `--json`.
 * There is no discard remedy: SpecFlow never discards work. A kind without paths is omitted.
 * The "agent work whose commit failed" kind joins when the attempt commit exists.
 */

import type { CloseRepositoryBlocker, DocumentError } from '@nevo/specflow-engine';

/** Paths named per owner or checkout before "and N more". */
const SHOWN_PATHS = 5;

const EXPLANATION = 'Closing starts from a committed checkout, and SpecFlow never discards work.';

/** `DOCUMENT_COMMITS_PENDING`'s `details.uncommitted`: the files SpecFlow wrote and left uncommitted. */
export type UncommittedHold = NonNullable<NonNullable<DocumentError['details']>['uncommitted']>;

/** An `uncommitted-changes` repository blocker of a refused Close. */
export type UncommittedBlocker = Extract<CloseRepositoryBlocker, { kind: 'uncommitted-changes' }>;

export interface UncommittedOwnerReport {
  readonly owner: 'specification' | 'definitions';
  /** Whose files: the Specification the Close is for, or another one; absent when not known. */
  readonly relation?: 'this' | 'other';
  readonly specId?: string;
  readonly title?: string;
  readonly count: number;
  readonly paths: readonly string[];
  readonly more: number;
  readonly stepInProgress?: boolean;
}

export interface UncommittedGroupReport {
  readonly kind: 'saved-not-committed' | 'changed-outside';
  readonly count: number;
  readonly remedy: string;
  /** `saved-not-committed`: one entry per owner. */
  readonly owners?: readonly UncommittedOwnerReport[];
  /** `changed-outside`: the checkout and its paths. */
  readonly checkout?: string;
  readonly workspaceId?: string;
  readonly paths?: readonly string[];
  readonly more?: number;
}

export interface UncommittedChangesReport {
  readonly count: number;
  readonly explanation: string;
  readonly groups: readonly UncommittedGroupReport[];
}

const checkoutName = (checkout: string) =>
  checkout === 'integration-target' ? 'the integration checkout' : 'the specification checkout';

const commitCommand = (specId: string | undefined) =>
  'nevo-specflow commit --spec ' + (specId ?? '<slug|id>');

function owner(
  entry: UncommittedHold['owners'][number],
  selfSpecId: string | undefined,
): UncommittedOwnerReport {
  // Every path the Engine named; `more` is how many of `count` it did not name.
  const common = { count: entry.count, paths: entry.paths, more: entry.count - entry.paths.length };
  if (entry.kind === 'definitions') {
    return { owner: 'definitions', ...common };
  }

  return {
    owner: 'specification',
    ...(selfSpecId === undefined
      ? {}
      : { relation: entry.specId === selfSpecId ? ('this' as const) : ('other' as const) }),
    specId: entry.specId,
    ...(entry.title === undefined ? {} : { title: entry.title }),
    ...(entry.stepInProgress === undefined ? {} : { stepInProgress: entry.stepInProgress }),
    ...common,
  };
}

/** The remedy of the files SpecFlow wrote: one sentence per kind of owner that is listed. */
function savedRemedy(owners: readonly UncommittedOwnerReport[]): string {
  const own = owners.find((entry) => entry.relation === 'this');
  const other = owners.find((entry) => entry.relation === 'other');
  const sentences: string[] = [];
  if (own) {
    sentences.push(
      'Commit this specification\'s files with "' +
        commitCommand(own.specId) +
        '" (see them with "nevo-specflow commit status"), or with Git.',
    );
  }

  if (other) {
    sentences.push(
      'Commit another specification\'s files from its Documents ("' +
        commitCommand(other.specId) +
        '") or with Git, or finish its step in progress there (finishing commits them).',
    );
  }

  return sentences.length > 0
    ? sentences.join(' ')
    : 'Commit them with "' +
        commitCommand(undefined) +
        '" (see them with "nevo-specflow commit status"), or with Git, or finish the step in progress (finishing commits them).';
}

/**
 * Groups what a Close refused as uncommitted: the files SpecFlow wrote (`hold`, or the
 * Specification's own paths of a blocker) and the changes made outside SpecFlow (the blocker's
 * other paths). `selfSpecId` is the Specification the Close is for. Undefined when nothing is
 * uncommitted.
 */
export function uncommittedChangesReport(
  input: {
    readonly hold?: UncommittedHold;
    readonly blockers?: readonly { readonly kind: string }[];
  },
  selfSpecId?: string,
): UncommittedChangesReport | undefined {
  const groups: UncommittedGroupReport[] = [];
  const saved: UncommittedOwnerReport[] = (input.hold?.owners ?? []).map((entry) =>
    owner(entry, selfSpecId),
  );
  const blockers = (input.blockers ?? []).filter(
    (blocker): blocker is UncommittedBlocker => blocker.kind === 'uncommitted-changes',
  );
  for (const blocker of blockers) {
    if (blocker.specificationCount > 0) {
      const shown = blocker.paths
        .filter((entry) => entry.scope === 'specification')
        .map((entry) => entry.path);
      saved.push({
        owner: 'specification',
        ...(selfSpecId === undefined ? {} : { relation: 'this' as const, specId: selfSpecId }),
        count: blocker.specificationCount,
        paths: shown,
        more: blocker.specificationCount - shown.length,
      });
    }
  }

  if (saved.length > 0) {
    groups.push({
      kind: 'saved-not-committed',
      count: saved.reduce((sum, entry) => sum + entry.count, 0),
      remedy: savedRemedy(saved),
      owners: saved,
    });
  }

  for (const blocker of blockers) {
    const count = blocker.count - blocker.specificationCount;
    if (count > 0) {
      const shown = blocker.paths
        .filter((entry) => entry.scope === 'other')
        .map((entry) => entry.path);
      groups.push({
        kind: 'changed-outside',
        count,
        remedy:
          'Commit them with Git in ' +
          checkoutName(blocker.checkout) +
          ' (workspace ' +
          blocker.workspaceId +
          ') or move them out of it. SpecFlow does not discard them: Git keeps no copy of uncommitted work.',
        checkout: blocker.checkout,
        workspaceId: blocker.workspaceId,
        paths: shown,
        more: count - shown.length,
      });
    }
  }

  if (groups.length === 0) {
    return undefined;
  }

  return {
    count: groups.reduce((sum, group) => sum + group.count, 0),
    explanation: EXPLANATION,
    groups,
  };
}

function ownerName(entry: UncommittedOwnerReport): string {
  if (entry.owner === 'definitions') {
    return 'Definitions';
  }

  const name = entry.title ?? entry.specId ?? 'Specification';
  if (entry.relation === undefined) {
    return name;
  }

  return name + (entry.relation === 'this' ? ' (this specification)' : ' (another specification)');
}

/** The human lines of the report, one group after the other, each ending with its remedy. */
export function uncommittedChangesLines(report: UncommittedChangesReport): string[] {
  const lines = [`Uncommitted changes: ${report.count}. ${report.explanation}`];
  const paths = (list: readonly string[], more: number, indent: string) => {
    for (const path of list.slice(0, SHOWN_PATHS)) {
      lines.push(indent + path);
    }

    const hidden = more + Math.max(0, list.length - SHOWN_PATHS);
    if (hidden > 0) {
      lines.push(indent + `and ${hidden} more`);
    }
  };

  for (const group of report.groups) {
    if (group.kind === 'saved-not-committed') {
      lines.push(`Saved in SpecFlow, not committed yet: ${group.count}`);
      for (const entry of group.owners ?? []) {
        lines.push(
          `  ${ownerName(entry)}: ${entry.count}` +
            (entry.stepInProgress === true ? ' (a step is in progress)' : ''),
        );
        paths(entry.paths, entry.more, '    ');
      }
    } else {
      lines.push(
        `Changed outside SpecFlow: ${group.count} (${checkoutName(group.checkout ?? '')}, workspace ${group.workspaceId})`,
      );
      paths(group.paths ?? [], group.more ?? 0, '  ');
    }

    lines.push('  Remedy: ' + group.remedy);
  }

  return lines;
}
