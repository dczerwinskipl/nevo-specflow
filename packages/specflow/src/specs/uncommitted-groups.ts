/**
 * The Close "Uncommitted changes" report (D16): everything Close refuses because the checkout is
 * not committed, as one group with a sub-group per kind and its remedy. The Specification Close UI
 * shows the same groups and remedies (`docs/product/specflow/ui/workflow-execution.md`, "Close:
 * one Uncommitted changes group"); the CLI prints them as text and under `uncommitted` in `--json`.
 * There is no discard remedy: SpecFlow never discards work. A kind without paths is omitted.
 * The "agent work whose commit failed" kind joins when the attempt commit exists.
 */

/** Paths named per owner or checkout before "and N more". */
const SHOWN_PATHS = 5;

const EXPLANATION = 'Closing starts from a committed checkout, and SpecFlow never discards work.';

/** The part of `DOCUMENT_COMMITS_PENDING`'s `details.uncommitted` the report reads. */
export interface UncommittedHold {
  readonly owners: readonly (
    | {
        readonly kind: 'specification';
        readonly specId: string;
        readonly title?: string;
        readonly stepInProgress?: boolean;
        readonly count: number;
        readonly paths: readonly string[];
      }
    | { readonly kind: 'definitions'; readonly count: number; readonly paths: readonly string[] }
  )[];
}

/** The part of an `uncommitted-changes` repository blocker the report reads. */
export interface UncommittedBlocker {
  readonly kind: 'uncommitted-changes';
  readonly checkout: string;
  readonly workspaceId: string;
  readonly paths: readonly { readonly path: string; readonly scope: 'specification' | 'other' }[];
  readonly count: number;
  readonly specificationCount: number;
}

export interface UncommittedOwnerReport {
  readonly owner: 'specification' | 'definitions';
  /** The Specification the Close is for. */
  readonly self?: true;
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
  const shown = entry.paths.slice(0, SHOWN_PATHS);
  const common = { count: entry.count, paths: shown, more: entry.count - shown.length };
  if (entry.kind === 'definitions') {
    return { owner: 'definitions', ...common };
  }

  return {
    owner: 'specification',
    ...(entry.specId === selfSpecId ? { self: true as const } : {}),
    specId: entry.specId,
    ...(entry.title === undefined ? {} : { title: entry.title }),
    ...(entry.stepInProgress === undefined ? {} : { stepInProgress: entry.stepInProgress }),
    ...common,
  };
}

/** The remedy of the files SpecFlow wrote, by whose they are. */
function savedRemedy(owners: readonly UncommittedOwnerReport[]): string {
  const other = owners.find((entry) => entry.self !== true && entry.owner === 'specification');
  if (other === undefined) {
    return (
      'Commit them with "' +
      commitCommand(owners.find((entry) => entry.self)?.specId) +
      '" (see them with "nevo-specflow commit status"), or with Git.'
    );
  }

  return (
    'Commit them from that specification\'s Documents ("' +
    commitCommand(other.specId) +
    '") or with Git, or finish its step in progress there (finishing commits them).'
  );
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
        .slice(0, SHOWN_PATHS)
        .map((entry) => entry.path);
      saved.push({
        owner: 'specification',
        ...(selfSpecId === undefined ? {} : { self: true as const, specId: selfSpecId }),
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
        .slice(0, SHOWN_PATHS)
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

  const name =
    entry.title === undefined ? (entry.specId ?? 'Specification') : '"' + entry.title + '"';

  return entry.self === true ? name + ' (this specification)' : name + ' (another specification)';
}

/** The human lines of the report, one group after the other, each ending with its remedy. */
export function uncommittedChangesLines(report: UncommittedChangesReport): string[] {
  const lines = [`Uncommitted changes: ${report.count}. ${report.explanation}`];
  const paths = (list: readonly string[], more: number, indent: string) => {
    for (const path of list) {
      lines.push(indent + path);
    }

    if (more > 0) {
      lines.push(indent + `and ${more} more`);
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
