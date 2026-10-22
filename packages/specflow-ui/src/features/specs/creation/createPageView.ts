import type { TFunction } from 'i18next';
import type { CreateSpecRequest } from '@nevo/specflow-contracts/specs';
import type { CreateOperationState } from './createOperationReducer';

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

/**
 * The calm line about where the specification goes, from the request that was sent (never from
 * server text). `placeName` is the name of an existing workspace as the owner saw it in the form.
 */
export function createTargetLine(
  target: CreateSpecRequest['target'] | undefined,
  placeName: string | undefined,
  t: TFunction,
): string {
  if (target?.kind === 'new-worktree')
    return target.branch
      ? t('create.page.target.newWorkspaceBranch', { branch: target.branch })
      : t('create.page.target.newWorkspace');
  if (target?.kind === 'existing')
    return placeName
      ? t('create.page.target.existing', { name: placeName })
      : t('create.page.target.existingUnnamed');
  return t('create.page.target.main');
}
