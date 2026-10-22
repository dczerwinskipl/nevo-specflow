import {
  branchNameProblem,
  engineCommitRefusal,
  specSlugProblem,
} from '@nevo/specflow-contracts/specs';
import type { CreateOptions } from '@nevo/specflow-contracts/specs';
import { message, type Message } from '../../../../i18n/message';
import type { WorkspaceChoice } from './workspaceChoice';
import {
  branchPreview,
  createOverrides,
  effectiveSlug,
  generatedBranchRefusal,
} from './createRequest';
import { activeTile, tileAvailability } from './workspaceTiles';

export type WorkspaceErrors = Partial<
  Record<'tile' | 'existing' | 'base' | 'target' | 'branch' | 'slug', Message>
>;
export const staleMessages = {
  tile: message('create.workspace.stale.tile'),
  existing: message('create.workspace.stale.existing'),
  base: message('create.workspace.stale.base'),
  target: message('create.workspace.stale.target'),
} as const;

/**
 * Errors of every remembered value, including the inactive tiles. Values are never removed;
 * the section shows an error only for the tile that is active.
 */
export function revalidate(choice: WorkspaceChoice, options: CreateOptions): WorkspaceErrors {
  const errors: WorkspaceErrors = {};
  if (
    choice.existingWorkspaceId &&
    !options.workspaces.some(
      (w) => w.workspaceId === choice.existingWorkspaceId && w.kind === 'linked' && w.selectable,
    )
  )
    errors.existing = staleMessages.existing;
  if (choice.base.on && choice.base.ref && !options.baseRefs.some((b) => b.ref === choice.base.ref))
    errors.base = staleMessages.base;
  if (
    choice.target.on &&
    choice.target.workspaceId &&
    !options.workspaces.some(
      (w) => w.workspaceId === choice.target.workspaceId && w.integrationSelectable === true,
    )
  )
    errors.target = staleMessages.target;
  if (choice.slug.on && choice.slug.edited && choice.slug.value) {
    const error = slugError(choice.slug.value);
    if (error) errors.slug = error;
  }
  if (choice.branch.on && choice.branch.edited && choice.branch.name.trim()) {
    const error = branchNameError(choice.branch.name, options);
    if (error) errors.branch = error;
  }
  return errors;
}

/** The blocking problems of the active tile, ordered like the footer prerequisite. */
export function problems(choice: WorkspaceChoice, options: CreateOptions, title = ''): Message[] {
  const tile = activeTile(choice, options);
  const availability = tileAvailability(options);
  if (!tile) return [message('create.workspace.errors.noWorkspace')];
  if (!availability[tile].ok) return [staleMessages.tile];
  const errors = revalidate(choice, options);
  const list: Message[] = [];
  if (tile === 'existing') {
    if (!choice.existingWorkspaceId) list.push(message('create.workspace.errors.pickWorkspace'));
    else if (errors.existing) list.push(errors.existing);
  }
  if (tile === 'new') {
    if (choice.base.on && !choice.base.ref) list.push(message('create.workspace.errors.pickBase'));
    else if (errors.base) list.push(errors.base);
    if (choice.target.on && !choice.target.workspaceId)
      list.push(message('create.workspace.errors.pickTarget'));
    else if (errors.target) list.push(errors.target);
    if (choice.slug.on && choice.slug.edited) {
      const error = slugError(choice.slug.value);
      if (error) list.push(error);
    }
    if (choice.branch.on && choice.branch.edited) {
      const error = branchNameError(choice.branch.name, options);
      if (error) list.push(error);
    }
    const generated = generatedBranchProblem(choice, options, title);
    if (generated) list.push(generated);
  }
  return list;
}

/**
 * The generated branch is one the Engine will not commit on and the owner has not typed another
 * name: Create stays unavailable until a name outside the protected ones is typed (the server
 * would refuse it as well; this says so before submit).
 */
export function generatedBranchProblem(
  choice: WorkspaceChoice,
  options: CreateOptions,
  title: string,
): Message | undefined {
  const slug = effectiveSlug(choice, title);
  const refusal = generatedBranchRefusal(options, slug);
  if (!refusal || createOverrides(choice, options, title).branch) return undefined;
  return message(
    refusal === 'branch-protected'
      ? 'create.workspace.errors.generatedBranchProtected'
      : 'create.workspace.errors.generatedBranchNotAllowed',
    { branch: branchPreview(options, slug) },
  );
}

/** Why a typed slug is unusable (shared contract rule), else undefined. */
export function slugError(value: string): Message | undefined {
  switch (specSlugProblem(value)) {
    case 'empty':
      return message('create.workspace.errors.slugEmpty');
    case 'too-long':
      return message('create.workspace.errors.slugTooLong');
    case 'reserved':
      return message('create.workspace.errors.slugReserved');
    case 'format':
      return message('create.workspace.errors.slugFormat');
    default:
      return undefined;
  }
}

/** Git-ref syntax (the contract rule the Engine enforces) plus collision with an existing local branch; the server stays authoritative. */
export function branchNameError(name: string, options: CreateOptions): Message | undefined {
  const branch = name.trim();
  switch (branchNameProblem(branch)) {
    case 'empty':
      return message('create.workspace.errors.branchEmpty');
    case 'too-long':
      return message('create.workspace.errors.branchTooLong');
    case 'characters':
      return message('create.workspace.errors.branchCharacters');
    case 'structure':
      return message('create.workspace.errors.branchStructure');
    default:
      break;
  }
  if (
    options.baseRefs.some((item) => item.ref === branch) ||
    options.workspaces.some((item) => item.branch === branch)
  )
    return message('create.workspace.errors.branchExists');
  const refusal = options.commits ? engineCommitRefusal(options.commits, branch) : undefined;
  if (refusal)
    return message(
      refusal === 'branch-protected'
        ? 'create.workspace.errors.branchProtected'
        : 'create.workspace.errors.branchNotAllowed',
    );
  return undefined;
}
