import { deriveSpecSlug, engineCommitRefusal } from '@nevo/specflow-contracts/specs';
import type { CreateOptions, CreateSpecRequest } from '@nevo/specflow-contracts/specs';
import type { WorkspaceChoice } from './workspaceChoice';
import { activeTile, defaultBaseValue, defaultTargetWorkspaceId } from './workspaceTiles';

type CreateTarget = NonNullable<CreateSpecRequest['target']>;

/** Slug in effect: the typed one when the owner edited it, otherwise the title-derived one. */
export function effectiveSlug(choice: WorkspaceChoice, title: string): string {
  return choice.slug.on && choice.slug.edited ? choice.slug.value : deriveSpecSlug(title);
}

/**
 * The generated branch for a slug, written like the configured pattern. Parts that exist only once
 * the Specification is reserved are shown as named placeholders, never as raw pattern braces: the
 * random id (`{shortId}`) as `<id>` and the Specification key (`{key}`, numbered at reservation,
 * for example `nevo-12`) as `<key>`; an unknown slug as `<slug>`.
 */
export function branchPreview(options: CreateOptions, slug: string): string {
  return options.branchPattern
    .replaceAll('{slug}', slug || '<slug>')
    .replaceAll('{shortId}', '<id>')
    .replaceAll('{key}', '<key>');
}

/** The parts of a pattern an owner cannot know before creation (with one separator after them). */
const unknownParts = /\{(?:shortId|key)\}[-_.]?/gu;

/**
 * Whether the Engine will refuse the branch Nevo generates (Git enabled, `commits` present): the
 * Runtime's representative-name verdict (`newWorktree.branchProtected`) or the pattern applied to
 * the actual slug, checked with the same rule the Engine uses. Absent: nothing to say.
 */
export function generatedBranchRefusal(
  options: CreateOptions,
  slug: string,
): 'branch-protected' | 'branch-not-allowed' | undefined {
  if (!options.commits) return undefined;
  if (options.newWorktree.branchProtected) return 'branch-protected';
  if (!slug) return undefined;
  const generated = options.branchPattern
    .replaceAll('{slug}', slug)
    .replaceAll('{shortId}', '0000000')
    .replaceAll('{key}', 'key-0');
  return engineCommitRefusal(options.commits, generated);
}

/**
 * Starting value of "use your own branch name": the generated name without the random id and the
 * key, which an owner cannot predict, so the result is a name they can adjust
 * (`feature/{key}-{slug}` gives `feature/<slug>`). Equal to the generated name only when the
 * pattern has neither.
 */
export function branchPrefill(options: CreateOptions, slug: string): string {
  if (!slug) return '';
  return options.branchPattern
    .replace(unknownParts, '')
    .replaceAll('{slug}', slug)
    .replace(/[-_./]+$/u, '');
}

/** The branch name the owner sees in the field: their own edit, else the prefilled default. */
export function branchFieldValue(
  choice: WorkspaceChoice,
  options: CreateOptions,
  title: string,
): string {
  return choice.branch.edited
    ? choice.branch.name
    : branchPrefill(options, effectiveSlug(choice, title));
}

export interface CreateOverrides {
  baseRef?: string;
  branch?: string;
  integrationTargetWorkspaceId?: string;
  slug?: string;
}

/**
 * Only values that differ from the effective default. An untouched prefilled value (or one the
 * owner typed back to the default) is not an override and must not be sent.
 */
export function createOverrides(
  choice: WorkspaceChoice,
  options: CreateOptions,
  title: string,
): CreateOverrides {
  const overrides: CreateOverrides = {};
  if (choice.base.on && choice.base.ref && choice.base.ref !== defaultBaseValue(options))
    overrides.baseRef = choice.base.ref;
  if (
    choice.target.on &&
    choice.target.workspaceId &&
    choice.target.workspaceId !== defaultTargetWorkspaceId(options)
  )
    overrides.integrationTargetWorkspaceId = choice.target.workspaceId;
  const slug = choice.slug.on && choice.slug.edited ? choice.slug.value : '';
  if (slug && slug !== deriveSpecSlug(title)) overrides.slug = slug;
  const branch = choice.branch.on && choice.branch.edited ? choice.branch.name.trim() : '';
  const exactDefault = /\{(?:shortId|key)\}/u.test(options.branchPattern)
    ? undefined
    : branchPrefill(options, effectiveSlug(choice, title));
  if (branch && branch !== exactDefault) overrides.branch = branch;
  return overrides;
}

export interface CreateTargetFields {
  title: string;
  slug?: string;
  target?: CreateTarget;
}

/** The workspace part of the request: only the active tile and only real overrides. */
export function buildCreateTarget(
  choice: WorkspaceChoice,
  options: CreateOptions,
  title = '',
): CreateTarget | undefined {
  const tile = activeTile(choice, options);
  if (tile === 'existing' && choice.existingWorkspaceId)
    return { kind: 'existing', workspaceId: choice.existingWorkspaceId };
  if (tile !== 'new') return undefined;
  const { baseRef, branch, integrationTargetWorkspaceId } = createOverrides(choice, options, title);
  return {
    kind: 'new-worktree',
    ...(baseRef ? { baseRef } : {}),
    ...(branch ? { branch } : {}),
    ...(integrationTargetWorkspaceId ? { integrationTargetWorkspaceId } : {}),
  };
}

/** The slug the request carries: only for a new workspace and only a real override. */
export function buildCreateSlug(
  choice: WorkspaceChoice,
  options: CreateOptions,
  title: string,
): string | undefined {
  return activeTile(choice, options) === 'new'
    ? createOverrides(choice, options, title).slug
    : undefined;
}
