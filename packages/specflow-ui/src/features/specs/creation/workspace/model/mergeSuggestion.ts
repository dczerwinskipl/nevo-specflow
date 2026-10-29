import type { CreateOptions } from '@nevo/specflow-contracts/specs';
import type { WorkspaceChoice } from './workspaceChoice';

export type MergeSuggestion =
  | { kind: 'offer'; workspaceId: string; branch: string; current?: string }
  | { kind: 'dirty'; branch: string };

/** Contextual merge-back offer after the base is a registered workspace branch (never automatic). */
export function mergeSuggestion(
  choice: WorkspaceChoice,
  options: CreateOptions,
): MergeSuggestion | undefined {
  if (!choice.base.on || !choice.base.ref) {
    return undefined;
  }

  // Strictly an optional idea: nothing here is ever sent unless the user accepts the offer.
  const checkedOut = options.baseRefs.find((b) => b.ref === choice.base.ref)?.checkedOutWorkspaceId;
  const workspace = options.workspaces.find((w) => w.workspaceId === checkedOut);
  if (!workspace?.branch || workspace.workspaceId === options.primaryWorkspaceId) {
    return undefined;
  }

  if (choice.dismissedSuggestions[workspace.workspaceId]) {
    return undefined;
  }

  if (choice.target.on && choice.target.workspaceId === workspace.workspaceId) {
    return undefined;
  }

  if (workspace.integrationSelectable !== true) {
    return workspace.state === 'dirty' ? { kind: 'dirty', branch: workspace.branch } : undefined;
  }

  return { kind: 'offer', workspaceId: workspace.workspaceId, branch: workspace.branch };
}

/**
 * Branch of the merge target in effect, if known: the pinned pick when the user made one, otherwise
 * the project target. With the switch on and nothing picked there is no target yet.
 */
export function effectiveTargetBranch(
  choice: WorkspaceChoice,
  options: CreateOptions,
): string | undefined {
  if (choice.target.on) {
    return choice.target.workspaceId
      ? options.workspaces.find((w) => w.workspaceId === choice.target.workspaceId)?.branch
      : undefined;
  }

  return options.integrationTargetBranch;
}
