import type { CreateSpecRequest } from '@nevo/specflow-contracts/specs';
import { message, type Message } from '../../../i18n/message';
import type { CreateFailure } from './errors/createFailure';
import type { CreateOperationState } from './createOperationReducer';
import type { CreateSettingsFacts, FactWorkspace } from './workspace/createFacts';

/**
 * What the progress page shows, derived from the operation state (never stored):
 * - `working`: the request is being sent or the operation runs (steps, calm status);
 * - `completed`: the specification exists (success state, then it opens);
 * - `refused`: a definite failure, nothing the operation changed is left open (back to the form);
 * - `unknown`: the outcome is not confirmed (or needs recovery): only a check of the same
 *   operation is offered, never a second create;
 * - `not-found`: the page was opened for an operation the server does not know.
 */
export type CreatePageView = 'working' | 'completed' | 'refused' | 'unknown' | 'not-found';

export function createPageView(
  state: Pick<CreateOperationState, 'phase'>,
  unknownOperation: boolean,
): CreatePageView {
  if (unknownOperation) return 'not-found';
  switch (state.phase) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'refused';
    case 'outcome-unknown':
    case 'recovery-required':
      return 'unknown';
    default:
      return 'working';
  }
}

const headingKeys = {
  working: 'create.page.heading.working',
  completed: 'create.page.heading.completed',
  refused: 'create.page.heading.refused',
  unknown: 'create.page.heading.unknown',
  'not-found': 'create.page.heading.notFound',
} as const satisfies Record<CreatePageView, string>;

/** The same headings with the specification name; used whenever the name is known. */
const namedHeadingKeys = {
  working: 'create.page.heading.workingNamed',
  completed: 'create.page.heading.completedNamed',
  refused: 'create.page.heading.refusedNamed',
  unknown: 'create.page.heading.unknownNamed',
} as const satisfies Partial<Record<CreatePageView, string>>;

/** The page heading: the state, with the specification name when it is known. */
export function createPageHeading(view: CreatePageView, name: string | undefined): Message {
  return name && view !== 'not-found'
    ? message(namedHeadingKeys[view], { name })
    : message(headingKeys[view]);
}

/** Refusals that happen before anything is done: the page may say nothing was created. */
const nothingCreatedKinds: ReadonlySet<CreateFailure['kind']> = new Set([
  'branch-exists',
  'branch-invalid',
  'stale',
  'name-conflict',
  'offline',
  'forbidden',
  'unauthenticated',
  'branch-protected',
  'commit-blocked',
]);

/** What the page needs to say what is going on now. */
export interface CreateStatusInput {
  readonly view: CreatePageView;
  readonly failure: CreateFailure | null;
  /** The operation has run a long while without finishing. */
  readonly stillWorking: boolean;
  /** The step that runs now, when the Runtime reported one. */
  readonly runningStep: Message | undefined;
  /** The operation is watched through the inspection endpoint (the Runtime accepted it). */
  readonly monitoring: boolean;
  /** The page re-reads an operation it resumed instead of sending a request. */
  readonly reading: boolean;
  /** The Create makes a new workspace (the generic line then says so). */
  readonly newWorkspace: boolean;
}

/**
 * The one status line of the page (also the only thing announced): what is going on now, or, for a
 * refusal that changed nothing, what was NOT created. Absent when there is nothing to add.
 */
export function createPageStatus(input: CreateStatusInput): Message | undefined {
  const { view, failure } = input;
  switch (view) {
    case 'completed':
      return message('create.page.status.completed');
    case 'refused':
      return failure && nothingCreatedKinds.has(failure.kind)
        ? message('create.page.notCreated')
        : undefined;
    case 'unknown':
      return failure?.kind === 'recovery-required' && failure.committed
        ? message('create.page.createdNotCommitted')
        : undefined;
    case 'not-found':
      return undefined;
    case 'working':
      if (input.stillWorking) return message('create.page.status.stillWorking');
      if (input.runningStep) return input.runningStep;
      if (input.monitoring)
        return message(
          input.newWorkspace ? 'create.page.status.workingNew' : 'create.page.status.working',
        );
      return message(input.reading ? 'create.page.status.reading' : 'create.page.status.sending');
  }
}

export const goalPreviewLength = 160;

/** The goal as a short preview: whitespace collapsed, cut on a word edge with an ellipsis. */
export function shortenGoal(goal: string | undefined, max = goalPreviewLength): string | undefined {
  const flat = goal?.replace(/\s+/gu, ' ').trim();
  if (!flat) return undefined;
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const edge = cut.lastIndexOf(' ');
  return `${(edge > max / 2 ? cut.slice(0, edge) : cut).trimEnd()}…`;
}

/**
 * What the progress page states about this Create, in plain facts. Built from the retained request
 * and the facts the form saved with the draft (never from server text); a value that is not known
 * is absent so the page omits that row instead of guessing. Undefined when nothing is known (a
 * direct link to an operation this browser did not start).
 */
export interface CreateSettingsModel {
  /** The full specification name (the heading may shorten it). */
  readonly name?: string;
  readonly place: 'new' | 'existing' | 'main';
  readonly workspace?: FactWorkspace;
  readonly base?: string;
  readonly baseHead?: boolean;
  readonly branch?: string;
  readonly folder?: string;
  readonly mergeInto?: FactWorkspace;
  readonly slug?: string;
  readonly goal?: string;
  /** Git is enabled: the specification files are committed (the branch is `branch` or the workspace's). */
  readonly commit?: true;
}

export function createSettingsModel(
  request: (Pick<CreateSpecRequest, 'target' | 'slug' | 'goal'> & { title?: string }) | undefined,
  draftGoal: string | undefined,
  facts: CreateSettingsFacts | undefined,
  draftTitle?: string,
): CreateSettingsModel | undefined {
  if (!request && !facts) return undefined;
  const target = request?.target;
  const place =
    facts?.place ??
    (target?.kind === 'new-worktree' ? 'new' : target?.kind === 'existing' ? 'existing' : 'main');
  const goal = shortenGoal(request?.goal ?? draftGoal);
  const name = (request?.title ?? draftTitle)?.trim();
  const slug = facts?.slug ?? request?.slug;
  const branch = facts?.branch ?? (target?.kind === 'new-worktree' ? target.branch : undefined);
  return {
    ...(name ? { name } : {}),
    place,
    ...(facts?.workspace ? { workspace: facts.workspace } : {}),
    ...(place === 'new' && facts?.base ? { base: facts.base } : {}),
    ...(place === 'new' && facts?.baseHead ? { baseHead: true } : {}),
    ...(place === 'new' && branch ? { branch } : {}),
    ...(place === 'new' && facts?.folder ? { folder: facts.folder } : {}),
    ...(place === 'new' && facts?.mergeInto ? { mergeInto: facts.mergeInto } : {}),
    ...(slug ? { slug } : {}),
    ...(goal ? { goal } : {}),
    ...(facts?.commit ? { commit: true as const } : {}),
  };
}
