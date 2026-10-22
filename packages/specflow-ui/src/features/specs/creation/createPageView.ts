import type { CreateSpecRequest } from '@nevo/specflow-contracts/specs';
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
  readonly place: 'new' | 'existing' | 'main';
  readonly workspace?: FactWorkspace;
  readonly base?: string;
  readonly baseHead?: boolean;
  readonly branch?: string;
  readonly folder?: string;
  readonly mergeInto?: FactWorkspace;
  readonly slug?: string;
  readonly goal?: string;
}

export function createSettingsModel(
  request: Pick<CreateSpecRequest, 'target' | 'slug' | 'goal'> | undefined,
  draftGoal: string | undefined,
  facts: CreateSettingsFacts | undefined,
): CreateSettingsModel | undefined {
  if (!request && !facts) return undefined;
  const target = request?.target;
  const place =
    facts?.place ??
    (target?.kind === 'new-worktree' ? 'new' : target?.kind === 'existing' ? 'existing' : 'main');
  const goal = shortenGoal(request?.goal ?? draftGoal);
  const slug = facts?.slug ?? request?.slug;
  const branch = facts?.branch ?? (target?.kind === 'new-worktree' ? target.branch : undefined);
  return {
    place,
    ...(facts?.workspace ? { workspace: facts.workspace } : {}),
    ...(place === 'new' && facts?.base ? { base: facts.base } : {}),
    ...(place === 'new' && facts?.baseHead ? { baseHead: true } : {}),
    ...(place === 'new' && branch ? { branch } : {}),
    ...(place === 'new' && facts?.folder ? { folder: facts.folder } : {}),
    ...(place === 'new' && facts?.mergeInto ? { mergeInto: facts.mergeInto } : {}),
    ...(slug ? { slug } : {}),
    ...(goal ? { goal } : {}),
  };
}
