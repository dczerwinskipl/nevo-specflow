import type { CreateOptions } from '@nevo/specflow-contracts/specs';
import { initialWorkspaceChoice, type WorkspaceChoice } from './workspaceChoice';
import { defaultBaseValue, defaultTargetWorkspaceId } from './workspaceTiles';

/**
 * The on/off transitions of the new-workspace decision rows (Start from, Merge into, Branch name).
 * "Change" turns an override on, "Use default" turns it off. On starts from the effective default,
 * so the owner only adjusts it and an untouched value is never sent (`createOverrides` sends only a
 * value that differs); off restores the default and forgets the value. The rows call nothing else,
 * so the request semantics stay those of the former switches.
 */

/** No local branch to start from: "Start from" cannot be changed. */
export const baseUnchangeable = (options: CreateOptions, choice: WorkspaceChoice): boolean =>
  options.baseRefs.length === 0 && !choice.base.on;

/** No workspace can be a merge target: "Merge into" cannot be changed. */
export const targetUnchangeable = (options: CreateOptions, choice: WorkspaceChoice): boolean =>
  options.workspaces.every((w) => w.integrationSelectable !== true) && !choice.target.on;

/** "Start from": on preselects the default base (never an empty picker), off restores it. */
export function baseOverride(
  options: CreateOptions,
  choice: WorkspaceChoice,
  on: boolean,
): Pick<WorkspaceChoice, 'base'> | null {
  if (on && baseUnchangeable(options, choice)) {
    return null;
  }

  return { base: { on, ref: on ? defaultBaseValue(options) : '' } };
}

/** "Merge into": on preselects the default target workspace, off follows the project again. */
export function targetOverride(
  options: CreateOptions,
  choice: WorkspaceChoice,
  on: boolean,
): Pick<WorkspaceChoice, 'target'> | null {
  if (on && targetUnchangeable(options, choice)) {
    return null;
  }

  return { target: { on, workspaceId: on ? defaultTargetWorkspaceId(options) : '' } };
}

/** The Branch name row is being changed: its slug and branch fields are shown. */
export const branchNameChanged = (choice: WorkspaceChoice): boolean =>
  choice.slug.on || choice.branch.on;

/**
 * "Branch name": on shows the slug and the branch field, each prefilled with what Nevo would
 * generate (the slug follows the title, the branch the slug) until the owner types; a field that
 * is already on keeps its value. Off forgets both and goes back to the generated name.
 */
export function branchNameOverride(
  choice: WorkspaceChoice,
  on: boolean,
): Pick<WorkspaceChoice, 'slug' | 'branch'> {
  if (!on) {
    return { slug: initialWorkspaceChoice.slug, branch: initialWorkspaceChoice.branch };
  }

  return {
    slug: choice.slug.on ? choice.slug : { on: true, value: '', edited: false },
    branch: choice.branch.on ? choice.branch : { on: true, name: '', edited: false },
  };
}
