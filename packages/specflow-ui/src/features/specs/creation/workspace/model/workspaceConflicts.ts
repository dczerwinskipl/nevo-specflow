import type { CreateFailure } from '../../errors/createFailure';

/**
 * What the server refused about a typed field, remembered so the field can say so until it is
 * edited. The values are what was sent: a different edit makes the remembered refusal irrelevant.
 */
export interface WorkspaceConflicts {
  /**
   * `exists`: the branch name is taken; `invalid`: Git does not accept it; `protected`: the
   * project does not let the Engine commit on it.
   */
  branch?: { readonly value: string; readonly reason: 'exists' | 'invalid' | 'protected' };
  slug?: { readonly value: string };
}

/**
 * What a definite refusal says about the typed fields, as a change to the remembered conflicts
 * (`undefined`: it says nothing about a field). `sent` holds what was typed: a slug counts only
 * when the owner really typed one, and a taken generated branch is no field's fault.
 */
export function conflictsOfFailure(
  failure: CreateFailure,
  sent: { readonly slug?: string; readonly branch: string },
): Partial<WorkspaceConflicts> | undefined {
  if (failure.kind === 'name-conflict')
    return sent.slug ? { slug: { value: sent.slug } } : undefined;
  if (failure.kind === 'branch-exists' && failure.automatic) return { branch: undefined };
  if (failure.kind === 'branch-protected')
    return failure.cause === 'typed-branch'
      ? { branch: { value: sent.branch, reason: 'protected' } }
      : undefined;
  if (failure.kind !== 'branch-exists' && failure.kind !== 'branch-invalid') return undefined;
  return {
    branch: {
      value: sent.branch,
      reason: failure.kind === 'branch-invalid' ? 'invalid' : 'exists',
    },
  };
}
