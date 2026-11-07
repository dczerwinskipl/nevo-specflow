import {
  branchNameProblem,
  engineCommitRefusal,
  localBranchRef,
  specSlugProblem,
} from '@nevo/specflow-contracts/specs';
import type { CreateOptions } from '@nevo/specflow-contracts/specs';
import { message, type Message } from '../../../../../i18n/message';
import type { WorkspaceChoice } from './workspaceChoice';
import {
  branchPreview,
  readableBranchName,
  createOverrides,
  effectiveSlug,
  generatedBranchRefusal,
} from './createRequest';
import { activeTile, tileAvailability } from './workspaceTiles';
import type { WorkspaceConflicts } from './workspaceConflicts';

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
  ) {
    errors.existing = staleMessages.existing;
  }

  if (
    choice.base.on &&
    choice.base.ref &&
    !options.baseRefs.some((b) => b.ref === choice.base.ref)
  ) {
    errors.base = staleMessages.base;
  }

  if (
    choice.target.on &&
    choice.target.workspaceId &&
    !options.workspaces.some(
      (w) => w.workspaceId === choice.target.workspaceId && w.integrationSelectable === true,
    )
  ) {
    errors.target = staleMessages.target;
  }

  if (choice.slug.on && choice.slug.edited && choice.slug.value) {
    const error = slugError(choice.slug.value);
    if (error) {
      errors.slug = error;
    }
  }

  if (choice.branch.on && choice.branch.edited && choice.branch.name.trim()) {
    const error = branchNameError(choice.branch.name, options);
    if (error) {
      errors.branch = error;
    }
  }

  return errors;
}

/** The field of the workspace section a blocking problem belongs to. */
export type WorkspaceProblemField = 'tile' | 'existing' | 'base' | 'target' | 'slug' | 'branch';

export interface WorkspaceProblem {
  readonly field: WorkspaceProblemField;
  readonly message: Message;
}

/**
 * The blocking problems of the active tile, in the section's own order (the tiles, then the fields
 * of the chosen place from top to bottom), each with the field that has to change. The first one
 * is the footer prerequisite and the field a blocked Create leads to.
 */
export function workspaceProblems(
  choice: WorkspaceChoice,
  options: CreateOptions,
  title = '',
): WorkspaceProblem[] {
  const tile = activeTile(choice, options);
  const availability = tileAvailability(options);
  if (!tile) {
    return [{ field: 'tile', message: message('create.workspace.errors.noWorkspace') }];
  }

  if (!availability[tile].ok) {
    return [{ field: 'tile', message: staleMessages.tile }];
  }

  const errors = revalidate(choice, options);
  const list: WorkspaceProblem[] = [];
  const add = (field: WorkspaceProblemField, problem: Message | undefined) => {
    if (problem) {
      list.push({ field, message: problem });
    }
  };

  if (tile === 'existing') {
    add('existing', choice.existingWorkspaceId ? errors.existing : requiredMessages.existing);
  }

  if (tile === 'new') {
    add('base', choice.base.on && !choice.base.ref ? requiredMessages.base : errors.base);
    add(
      'target',
      choice.target.on && !choice.target.workspaceId ? requiredMessages.target : errors.target,
    );
    if (choice.slug.on && choice.slug.edited) {
      add('slug', slugError(choice.slug.value));
    }

    if (choice.branch.on && choice.branch.edited) {
      add('branch', branchNameError(choice.branch.name, options));
    }

    add('branch', generatedBranchProblem(choice, options, title));
  }

  return list;
}

/** The blocking problems of the active tile as messages, in the section's order. */
export function problems(choice: WorkspaceChoice, options: CreateOptions, title = ''): Message[] {
  return workspaceProblems(choice, options, title).map((problem) => problem.message);
}

/** What a picker that was opened but left empty says (shown once Create was tried). */
export const requiredMessages = {
  existing: message('create.workspace.errors.pickWorkspace'),
  base: message('create.workspace.errors.pickBase'),
  target: message('create.workspace.errors.pickTarget'),
} as const;

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
  if (!refusal || createOverrides(choice, options, title).branch) {
    return undefined;
  }

  return message(
    refusal === 'branch-protected'
      ? 'create.workspace.errors.generatedBranchProtected'
      : 'create.workspace.errors.generatedBranchNotAllowed',
    { branch: readableBranchName(branchPreview(options, slug)) },
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

  // `baseRefs` hold full refs, workspaces short branch names.
  if (
    options.baseRefs.some((item) => item.ref === localBranchRef(branch)) ||
    options.workspaces.some((item) => item.branch === branch)
  ) {
    return message('create.workspace.errors.branchExists');
  }

  const refusal = options.commits ? engineCommitRefusal(options.commits, branch) : undefined;
  if (refusal) {
    return message(
      refusal === 'branch-protected'
        ? 'create.workspace.errors.branchProtected'
        : 'create.workspace.errors.branchNotAllowed',
    );
  }

  return undefined;
}

/**
 * The text each typed field shows under it: a live error of the typed value first, then what the
 * server refused about exactly that value (until it is edited), then, for the branch, the problem
 * of the generated name. Pure: the components only translate it.
 */
export function workspaceFieldErrors(
  choice: WorkspaceChoice,
  options: CreateOptions,
  conflicts: WorkspaceConflicts | undefined,
  title: string,
  errors: WorkspaceErrors,
): { branch?: Message; slug?: Message } {
  const branchConflict =
    conflicts?.branch &&
    choice.branch.edited &&
    choice.branch.name.trim() === conflicts.branch.value
      ? message(
          conflicts.branch.reason === 'invalid'
            ? 'create.workspace.errors.branchRejected'
            : conflicts.branch.reason === 'protected'
              ? 'create.workspace.errors.branchProtected'
              : 'create.workspace.errors.branchExists',
        )
      : undefined;
  const typedBranch = choice.branch.on && choice.branch.edited;
  const branch =
    (errors.branch && choice.branch.name.trim() ? errors.branch : undefined) ??
    // A name typed and then cleared blocks Create: say so at the field, not only in the footer.
    (typedBranch && !choice.branch.name.trim()
      ? message('create.workspace.errors.branchEmpty')
      : undefined) ??
    branchConflict ??
    generatedBranchProblem(choice, options, title);
  const typedSlug = choice.slug.edited ? slugError(choice.slug.value) : undefined;
  const slug =
    typedSlug ??
    (conflicts?.slug && choice.slug.edited && choice.slug.value === conflicts.slug.value
      ? message('create.workspace.errors.slugTaken')
      : undefined);

  return { ...(branch ? { branch } : {}), ...(slug ? { slug } : {}) };
}
