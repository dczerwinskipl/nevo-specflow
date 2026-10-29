import { message, type Message } from '../../../../../i18n/message';
import type { WorkspaceChoice } from './workspaceChoice';
import type { CreateOptions } from '@nevo/specflow-contracts/specs';
import { createOverrides } from './createRequest';

const knownReasons = new Set([
  'dirty',
  'detached',
  'checkout-unavailable',
  'git-membership-mismatch',
  'git-disabled',
  'git-unavailable',
  'branch-protected',
  'branch-not-allowed',
  'git-policy-invalid',
]);
const reasonSuffix = (reason?: string) => (reason && knownReasons.has(reason) ? reason : 'other');
/** Reader-facing reason of an unavailable workspace; falls back to a neutral word. */
export function reasonText(reason?: string): Message {
  return message(
    `create.workspace.reason.${reasonSuffix(reason)}` as 'create.workspace.reason.other',
  );
}

/** The same reason phrased to continue a sentence (no leading capital). */
export const reasonTextInline = (reason?: string): Message =>
  message(
    `create.workspace.reasonInline.${reasonSuffix(reason)}` as 'create.workspace.reasonInline.other',
  );

/**
 * The same reasons for a workspace seen as a MERGE TARGET. Uncommitted changes do not block
 * creating the specification; they block merging into that checkout later, so the reason says
 * what to do. Other reasons read as elsewhere.
 */
export const targetReasonText = (reason?: string): Message =>
  reason === 'dirty' ? message('create.workspace.merge.reasonDirty') : reasonText(reason);
export const targetReasonTextInline = (reason?: string): Message =>
  reason === 'dirty'
    ? message('create.workspace.merge.reasonDirtyInline')
    : reasonTextInline(reason);

/** Quiet note under a merge target that cannot be merged into now; creation is never affected. */
export const mergeUnavailableNote = (reason?: string): Message =>
  reason === 'dirty'
    ? message('create.workspace.merge.noteDirty')
    : message('create.workspace.merge.noteUnavailable', { reason: reasonTextInline(reason) });

/** Label of a workspace without a branch. */
export const noBranchLabel: Message = message('create.workspace.noBranch');

/** Count of existing specifications ("none", "1 specification", plural forms per locale). */
export function specCountLabel(count: number): Message {
  return count === 0
    ? message('create.workspace.specCountNone')
    : message('create.workspace.specCount', { count });
}

export const availableCountLabel = (count: number): Message =>
  message('create.workspace.availableCount', { count });
/** Calm note that other specifications already use this place (shared changes and history). */
export function sharedUseNote(count: number, place: 'workspace' | 'folder'): Message {
  return message(
    place === 'workspace'
      ? 'create.workspace.sharedUseWorkspace'
      : 'create.workspace.sharedUseFolder',
    { count },
  );
}

/** Summary of the real overrides, e.g. `2 changes: base, target`. */
export const defaultSettingsSummary: Message = message('create.workspace.settings.default');
export function settingsSummary(
  choice: WorkspaceChoice,
  options: CreateOptions,
  title: string,
): Message {
  const overrides = createOverrides(choice, options, title);
  const names: Message[] = [];
  if (overrides.baseRef) {
    names.push(message('create.workspace.settings.nameBase'));
  }

  if (overrides.integrationTargetWorkspaceId) {
    names.push(message('create.workspace.settings.nameTarget'));
  }

  if (overrides.slug) {
    names.push(message('create.workspace.settings.nameSlug'));
  }

  if (overrides.branch) {
    names.push(message('create.workspace.settings.nameBranch'));
  }

  if (names.length === 0) {
    return defaultSettingsSummary;
  }

  return message('create.workspace.settings.changed', { count: names.length, names });
}
