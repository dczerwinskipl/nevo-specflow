import { ERROR_DETAIL_PATHS_MAX } from '@nevo/specflow-contracts/documents';

import { WorkflowError, type WorkflowErrorCode } from '../../errors';
import {
  AGENT_DIRTY_PATH_LENGTH_MAX,
  AGENT_DIRTY_PATHS_MAX,
  type AgentDirtySet,
  type AttributionDetails,
} from '../journal/model';

/**
 * Attribution of an agent attempt's uncommitted work (B3, B6): who changed each dirty path of the
 * attempt's checkout. The Engine attributes a path to itself when its bytes are the post-image of
 * its latest uncommitted write of it (the newest document change waiting for its commit, else the
 * ledger entry); everything else dirty was written past the Engine. Pure: the facts come from
 * `facts.ts`.
 */

/**
 * Where a dirty path lies: `specification` inside a Specification directory (`<root>/<location>/
 * <slug>/` of the Specification root; `registered` whether its container's registry lists it),
 * `engine` in the Engine's own namespace (derived from the Project Home), `nested-repository` an
 * untracked Git repository inside the checkout (Git names its folder, `dir/`), `code` anywhere else.
 */
export type AttributionArea =
  | { readonly kind: 'code' }
  | { readonly kind: 'engine' }
  | { readonly kind: 'nested-repository' }
  | { readonly kind: 'specification'; readonly registered: boolean };

/**
 * One uncommitted write of the Engine to a path: a ledger entry (`operationIds` the newest it keeps,
 * `operationCount` how many there were) or an unsettled document change (one operation). Its
 * `executions` name the agent Turns (execution claims) that made its operations; an operation
 * without one was not an agent's. `latest` marks the write whose post-image the path must have.
 */
export interface EngineWriteFact {
  /** The post-image's sha256; `null` when the write removed the path. */
  readonly sha256: string | null;
  readonly source: 'ledger' | 'journal';
  readonly operationIds: readonly string[];
  readonly operationCount: number;
  readonly executions: readonly { readonly operationId: string; readonly executionId: string }[];
  readonly latest: boolean;
}

/** One dirty path of the checkout, as Git status reports it (ignored files never are). */
export interface DirtyPathFact {
  readonly path: string;
  /** sha256 of its bytes now; `null` when it is gone or not a regular file, or `oversize`. */
  readonly sha256: string | null;
  readonly oversize?: true;
  /** Not in HEAD: untracked, staged as new, or the new side of a staged rename or copy. */
  readonly added: boolean;
  readonly area: AttributionArea;
  /** The Engine's uncommitted writes of the path, oldest first (one is `latest`). */
  readonly engine?: readonly EngineWriteFact[];
}

/** What is uncommitted in the attempt's checkout; `incomplete` when it cannot be read in full. */
export interface AttributionFacts {
  readonly paths: readonly DirtyPathFact[];
  /**
   * More dirty paths than are named, or Engine writes whose record cannot be read: nothing is
   * attributed then (fail closed).
   */
  readonly incomplete: boolean;
}

export type { AttributionDetails };

type AttributionCode = Extract<
  WorkflowErrorCode,
  | 'WORKFLOW_DIRTY_BASELINE'
  | 'WORKFLOW_BASELINE_CHANGED'
  | 'WORKFLOW_UNREGISTERED_DOCUMENTS'
  | 'WORKFLOW_ENGINE_FILE_EDITED'
  | 'WORKFLOW_UNDECLARED_CHANGES'
  | 'WORKFLOW_NESTED_REPOSITORY'
  | 'WORKFLOW_OWNER_WORK_UNCOMMITTED'
>;

/** An attribution refusal: what it refuses is in `code`, the paths in `attribution`. */
export class AttributionRefusalError extends WorkflowError {
  readonly attribution: AttributionDetails;

  constructor(code: AttributionCode, message: string, attribution: AttributionDetails) {
    super(code, message);
    this.attribution = attribution;
  }
}

/**
 * Whether the path's bytes now are the post-image of the Engine's latest write of it. An older
 * post-image restored by hand is not the Engine's: its latest write is gone.
 */
export function isEngineAttributed(fact: DirtyPathFact): boolean {
  const latest = fact.engine?.find((write) => write.latest);
  // `undefined` (no Engine write) never equals a hash or `null`.
  const expected = latest === undefined ? undefined : latest.sha256;

  return fact.oversize !== true && expected === fact.sha256;
}

function named(paths: readonly string[]): readonly string[] {
  return [...paths].sort().slice(0, ERROR_DETAIL_PATHS_MAX);
}

function listed(paths: readonly string[]): string {
  const shown = named(paths);
  const more = paths.length - shown.length;

  return shown.join(', ') + (more > 0 ? ` and ${String(more)} more` : '');
}

function details(paths: readonly string[]): AttributionDetails {
  return { paths: named(paths), count: paths.length };
}

const INCOMPLETE: AttributionDetails = { paths: [], count: 0, incomplete: true };

const CANNOT_READ =
  'SpecFlow cannot tell who changed the uncommitted files of this checkout (too many changed files, ' +
  'or a record of its own writes is unreadable).';

/**
 * Clean-baseline admission of a new agent attempt (B3 rule 1): refused while the checkout has a dirty
 * path the Engine cannot attribute to its own uncommitted writes, naming them, so whatever is dirty at
 * the attempt's end came from the attempt (the Engine's own writes aside).
 */
export function assertCleanBaseline(facts: AttributionFacts): void {
  if (facts.incomplete) {
    throw new AttributionRefusalError(
      'WORKFLOW_DIRTY_BASELINE',
      `${CANNOT_READ} Commit or revert the changes, then ask the agent again.`,
      INCOMPLETE,
    );
  }

  const foreign = facts.paths.filter((fact) => !isEngineAttributed(fact)).map((fact) => fact.path);
  if (foreign.length > 0) {
    throw new AttributionRefusalError(
      'WORKFLOW_DIRTY_BASELINE',
      `The checkout has ${String(foreign.length)} uncommitted change(s) SpecFlow cannot attribute: ` +
        `${listed(foreign)}. Commit or revert them, then ask the agent again.`,
      details(foreign),
    );
  }
}

/**
 * Hand to agent: the owner's attempt ends and the agent's starts from the checkout as it is, so
 * nothing uncommitted may be there but the owner's workflow state of the Specification
 * (`ownerState`), which the hand commits first. Anything else dirty (a file the owner changed in the
 * step, a document they saved without its commit, what an earlier attempt left) would be taken by
 * the agent's attempt commit as the agent's work, or lost from the owner's attempt: refused
 * `WORKFLOW_OWNER_WORK_UNCOMMITTED`, naming the paths, before anything is written. Facts that cannot
 * be read in full refuse too.
 */
export function assertNoOwnerWork(facts: AttributionFacts, ownerState: readonly string[]): void {
  const remedy =
    'Commit your work (or undo it), then hand the step to the agent; the agent then starts from it.';
  if (facts.incomplete) {
    throw new AttributionRefusalError(
      'WORKFLOW_OWNER_WORK_UNCOMMITTED',
      `${CANNOT_READ} ${remedy}`,
      INCOMPLETE,
    );
  }

  const committedByHand = new Set(ownerState);
  const work = facts.paths.map((fact) => fact.path).filter((path) => !committedByHand.has(path));
  if (work.length > 0) {
    throw new AttributionRefusalError(
      'WORKFLOW_OWNER_WORK_UNCOMMITTED',
      `The checkout has ${String(work.length)} uncommitted change(s): ${listed(work)}. The agent's ` +
        `attempt would take them as its own work. ${remedy}`,
      details(work),
    );
  }
}

/**
 * The refusal of a new agent attempt while SpecFlow's own workflow state of the Specification is
 * uncommitted after the start's owner commit (it held or failed): the agent's start and finish would
 * write into those files, and its attempt commit would refuse them as mixed.
 */
export function ownerStateUncommitted(paths: readonly string[]): AttributionRefusalError {
  return new AttributionRefusalError(
    'WORKFLOW_DIRTY_BASELINE',
    `SpecFlow could not commit its own workflow state of this Specification: ${listed(paths)}. ` +
      'The agent must not start on top of uncommitted workflow changes. Commit these files with ' +
      'Git (or undo the edits made to them by hand), then ask the agent again.',
    details(paths),
  );
}

/**
 * The baseline at a Turn's dispatch (Continue, B3 rule 2): refused while a dirty path the Engine does
 * not attribute to itself differs from the dirty set recorded when the attempt's previous Turn
 * settled, naming the paths changed since. A recorded path that is clean now was committed or
 * reverted by hand and no longer counts (owner decision 2026-11-20). With no record, or a cut one,
 * nothing can be compared: refused (fail closed).
 */
export function assertBaselineUnchanged(
  facts: AttributionFacts,
  recorded: AgentDirtySet | undefined,
): void {
  if (facts.incomplete || recorded === undefined || recorded.truncated === true) {
    throw new AttributionRefusalError(
      'WORKFLOW_BASELINE_CHANGED',
      'SpecFlow cannot tell which files changed since the agent stopped. Commit or revert the ' +
        'uncommitted changes, then continue; or take over the step.',
      INCOMPLETE,
    );
  }

  const before = new Map(recorded.paths.map((entry) => [entry.path, entry]));
  const changed = facts.paths
    .filter((fact) => {
      if (isEngineAttributed(fact)) {
        return false;
      }

      const was = before.get(fact.path);

      return (
        was === undefined ||
        was.oversize === true ||
        fact.oversize === true ||
        was.sha256 !== fact.sha256
      );
    })
    .map((fact) => fact.path);
  if (changed.length > 0) {
    throw new AttributionRefusalError(
      'WORKFLOW_BASELINE_CHANGED',
      `${String(changed.length)} file(s) changed since the agent stopped: ${listed(changed)}. ` +
        "SpecFlow never counts someone else's edits as the agent's work: undo these changes, or " +
        'commit them yourself, then continue; or take over the step.',
      details(changed),
    );
  }
}

/**
 * A declared path: checkout-relative, `/` separators, no empty, `.` or `..` segment (a nested
 * repository's folder may end in `/`, as Git names it; the finish then refuses it by name); each once.
 */
export function assertDeclaredPathsShape(paths: readonly string[]): void {
  if (paths.length > AGENT_DIRTY_PATHS_MAX) {
    throw new WorkflowError(
      'WORKFLOW_INPUT_INVALID',
      `A finish proposal declares at most ${String(AGENT_DIRTY_PATHS_MAX)} changed files.`,
    );
  }

  const invalid = paths.find(
    (path) =>
      typeof path !== 'string' ||
      path.length > AGENT_DIRTY_PATH_LENGTH_MAX ||
      path.includes('\\') ||
      path.includes('\0') ||
      (path.endsWith('/') ? path.slice(0, -1) : path)
        .split('/')
        .some((segment) => segment === '' || segment === '.' || segment === '..'),
  );
  if (invalid !== undefined) {
    throw new WorkflowError(
      'WORKFLOW_INPUT_INVALID',
      `A declared changed file is a checkout-relative path with "/" separators: "${invalid.slice(0, 200)}".`,
    );
  }

  if (new Set(paths).size !== paths.length) {
    throw new WorkflowError('WORKFLOW_INPUT_INVALID', 'A changed file is declared more than once.');
  }
}

/**
 * The attribution checks of an agent finish (B6, B3 rules 3 and 4), at submission and again at the
 * finalize, in this order:
 *
 * 0. an untracked nested Git repository: nothing in it can be attributed or committed
 *    (`WORKFLOW_NESTED_REPOSITORY`: commit it in its own repository, remove it, or ignore it);
 * 1. a file of a Specification directory that its registry does not list
 *    (`WORKFLOW_UNREGISTERED_DOCUMENTS`, D14: a new one is classified with a type or deleted, an
 *    edited tracked one classified or restored);
 * 2. a dirty file of a Specification directory or of the Engine's namespace whose bytes are none of
 *    the Engine's post-images: a document, Task or execution file written past the Engine
 *    (`WORKFLOW_ENGINE_FILE_EDITED`);
 * 3. the declared `changes.paths` must equal the dirty paths outside both: an undeclared changed file
 *    or a declared file that is not changed refuses (`WORKFLOW_UNDECLARED_CHANGES`).
 *
 * Facts that cannot be read in full refuse (`WORKFLOW_UNDECLARED_CHANGES`, `incomplete`).
 */
export function assertFinishAttribution(
  facts: AttributionFacts,
  declared: readonly string[],
): void {
  if (facts.incomplete) {
    throw new AttributionRefusalError(
      'WORKFLOW_UNDECLARED_CHANGES',
      `${CANNOT_READ} Ask the owner to commit or revert what is not the agent's, then finish again.`,
      INCOMPLETE,
    );
  }

  const unattributed = facts.paths.filter((fact) => !isEngineAttributed(fact));
  const nested = unattributed
    .filter((fact) => fact.area.kind === 'nested-repository')
    .map((fact) => fact.path);
  if (nested.length > 0) {
    throw new AttributionRefusalError(
      'WORKFLOW_NESTED_REPOSITORY',
      `${String(nested.length)} Git repositor(ies) inside the checkout cannot be attributed: ` +
        `${listed(nested)}. Commit its work in its own repository, remove it, or ignore it ` +
        '(.gitignore), then finish again.',
      details(nested),
    );
  }

  const unregistered = unattributed.filter(
    (fact) => fact.area.kind === 'specification' && !fact.area.registered,
  );
  if (unregistered.length > 0) {
    const created = unregistered.filter((fact) => fact.added).map((fact) => fact.path);
    const edited = unregistered.filter((fact) => !fact.added).map((fact) => fact.path);
    const parts = [
      ...(created.length > 0 ? [`new, give each a type or delete it: ${listed(created)}`] : []),
      ...(edited.length > 0 ? [`changed, give each a type or restore it: ${listed(edited)}`] : []),
    ];

    throw new AttributionRefusalError(
      'WORKFLOW_UNREGISTERED_DOCUMENTS',
      `${String(unregistered.length)} file(s) of the Specification have no document type ` +
        `(${parts.join('; ')}). Classify with nevo-specflow documents classify --type, then ` +
        'finish again.',
      {
        ...details([...created, ...edited]),
        remedies: [
          'classify',
          ...(created.length > 0 ? (['delete'] as const) : []),
          ...(edited.length > 0 ? (['restore'] as const) : []),
        ],
      },
    );
  }

  const edited = unattributed
    .filter((fact) => fact.area.kind === 'specification' || fact.area.kind === 'engine')
    .map((fact) => fact.path);
  if (edited.length > 0) {
    throw new AttributionRefusalError(
      'WORKFLOW_ENGINE_FILE_EDITED',
      `${String(edited.length)} file(s) SpecFlow writes were changed past it: ${listed(edited)}. ` +
        'Save documents and Tasks through SpecFlow (nevo-specflow documents, nevo-specflow tasks) ' +
        'or restore them, then finish again.',
      details(edited),
    );
  }

  const changed = new Set(
    unattributed.filter((fact) => fact.area.kind === 'code').map((fact) => fact.path),
  );
  const declaredSet = new Set(declared);
  const undeclared = [...changed].filter((path) => !declaredSet.has(path));
  const unchanged = declared.filter((path) => !changed.has(path));
  if (undeclared.length > 0 || unchanged.length > 0) {
    const parts = [
      ...(undeclared.length > 0 ? [`changed but not declared: ${listed(undeclared)}`] : []),
      ...(unchanged.length > 0 ? [`declared but not changed: ${listed(unchanged)}`] : []),
    ];

    throw new AttributionRefusalError(
      'WORKFLOW_UNDECLARED_CHANGES',
      `The declared changes are not the changed files (${parts.join('; ')}). Declare exactly the ` +
        "files the attempt changed outside SpecFlow's folders, then finish again.",
      {
        ...details([...undeclared, ...unchanged]),
        undeclared: named(undeclared),
        unchanged: named(unchanged),
      },
    );
  }
}
