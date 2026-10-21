import type { DemoCreateOptions, DemoCreateTarget } from '@nevo/specflow-contracts/demo';
import { message, type Message } from '../../../i18n/message';

/**
 * Pure policy of the "Gdzie chcesz pracować?" section: which tiles are available, what the
 * request carries, and which stale values must be flagged. The UI never generates slugs, branch
 * names or paths; it only forwards a real override or nothing.
 */
export type Tile = 'new' | 'main' | 'existing';
type Workspace = DemoCreateOptions['workspaces'][number];

export interface WorkspaceChoice {
  /** `null` = untouched: the tile follows {@link defaultTile} until the user picks one. */
  tile: Tile | null;
  base: { on: boolean; ref: string };
  target: { on: boolean; workspaceId: string };
  branch: { on: boolean; name: string };
  existingWorkspaceId: string;
  settingsOpen: boolean;
  /** Merge-back suggestions the user declined, per workspace id. */
  dismissedSuggestions: Record<string, true>;
}

export const initialWorkspaceChoice: WorkspaceChoice = {
  tile: null,
  base: { on: false, ref: '' },
  target: { on: false, workspaceId: '' },
  branch: { on: false, name: '' },
  existingWorkspaceId: '',
  settingsOpen: false,
  dismissedSuggestions: {},
};

const knownReasons = new Set([
  'dirty',
  'detached',
  'checkout-unavailable',
  'git-membership-mismatch',
  'git-disabled',
  'git-unavailable',
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

/** Label of a workspace without a branch. */
export const noBranchLabel: Message = message('create.workspace.noBranch');

export const primaryWorkspace = (options: DemoCreateOptions) =>
  options.workspaces.find((w) => w.workspaceId === options.primaryWorkspaceId);
const linkedWorkspaces = (options: DemoCreateOptions) =>
  options.workspaces.filter((w) => w.kind === 'linked');

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

export interface TileAvailability {
  ok: boolean;
  /** Visible reason that replaces the description when the tile is unavailable. */
  reason?: Message;
  /** Selectable linked workspaces (existing tile). */
  count?: number;
}

export function tileAvailability(options: DemoCreateOptions): Record<Tile, TileAvailability> {
  const created = options.newWorktree;
  const primary = primaryWorkspace(options);
  const linked = linkedWorkspaces(options);
  const selectable = linked.filter((w) => w.selectable);
  return {
    new:
      created.status === 'available'
        ? { ok: true }
        : {
            ok: false,
            reason: message(
              created.status === 'disabled'
                ? 'create.workspace.tileReason.newDisabled'
                : created.reason === 'git-membership-mismatch'
                  ? 'create.workspace.tileReason.newMismatch'
                  : created.reason === 'checkout-unavailable'
                    ? 'create.workspace.tileReason.newCheckoutUnavailable'
                    : 'create.workspace.tileReason.newGitUnavailable',
            ),
          },
    main: primary?.selectable
      ? { ok: true }
      : {
          ok: false,
          reason: message(
            primary?.state === 'detached'
              ? 'create.workspace.tileReason.mainDetached'
              : 'create.workspace.tileReason.mainUnavailable',
          ),
        },
    existing:
      linked.length === 0
        ? { ok: false, reason: message('create.workspace.tileReason.existingNone') }
        : selectable.length === 0
          ? { ok: false, reason: message('create.workspace.tileReason.existingUnavailable') }
          : { ok: true, count: selectable.length },
  };
}

/** Initial tile only; after the user picks one it never jumps silently. */
export function defaultTile(options: DemoCreateOptions): Tile | null {
  const availability = tileAvailability(options);
  return (['new', 'main', 'existing'] as const).find((tile) => availability[tile].ok) ?? null;
}
export const activeTile = (choice: WorkspaceChoice, options: DemoCreateOptions): Tile | null =>
  choice.tile ?? defaultTile(options);

const hasControlCharacter = (value: string) =>
  [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
const branchMaxLength = 200;
const branchStructureInvalid = (branch: string) =>
  branch.startsWith('/') ||
  branch.startsWith('-') ||
  branch === '@' ||
  branch.endsWith('/') ||
  branch.endsWith('.') ||
  branch.includes('..') ||
  branch.includes('@{') ||
  branch.split('/').some((part) => !part || part.startsWith('.') || part.endsWith('.lock'));
const branchCharactersInvalid = (branch: string) =>
  /[\s~^:?*[\\]/.test(branch) || hasControlCharacter(branch);

/** Git-ref syntax plus collision with an existing local branch; the server stays authoritative. */
export function branchNameError(name: string, options: DemoCreateOptions): Message | undefined {
  const branch = name.trim();
  if (!branch) return message('create.workspace.errors.branchEmpty');
  if (branch.length > branchMaxLength) return message('create.workspace.errors.branchTooLong');
  if (branchCharactersInvalid(branch)) return message('create.workspace.errors.branchCharacters');
  // Every character is legal here, so the message names the structural rule instead (F-07).
  if (branchStructureInvalid(branch)) return message('create.workspace.errors.branchStructure');
  if (
    options.baseRefs.some((item) => item.ref === branch) ||
    options.workspaces.some((item) => item.branch === branch)
  )
    return message('create.workspace.errors.branchExists');
  return undefined;
}

export type TargetStatus =
  | { kind: 'none' }
  | { kind: 'ok'; branch: string; workspace: Workspace }
  /** The primary workspace is on the target branch but cannot be a target now (e.g. unsaved changes). */
  | { kind: 'unavailable'; branch: string; workspace: Workspace }
  /** The primary workspace is on another branch (or has none): Close would refuse. */
  | { kind: 'other-branch'; branch: string; primary?: Workspace };

/**
 * Whether the project's DEFAULT integration target can be used right now. The Engine realises the
 * default target through the PRIMARY workspace only, so it is available exactly when
 * `primary.branch === integrationTargetBranch && primary.integrationSelectable`. A linked workspace
 * that happens to sit on that branch does not count. The result only decides a quiet note:
 * Create never validates the target and is never blocked by it.
 */
export function targetStatus(options: DemoCreateOptions): TargetStatus {
  const branch = options.integrationTargetBranch;
  if (!branch) return { kind: 'none' };
  const primary = primaryWorkspace(options);
  if (primary?.branch !== branch) return { kind: 'other-branch', branch, primary };
  return primary.integrationSelectable === true
    ? { kind: 'ok', branch, workspace: primary }
    : { kind: 'unavailable', branch, workspace: primary };
}

export type InheritedTarget =
  /** A pin fixed when the workspace was created; `drift` when it can no longer be honoured as pinned. */
  | { kind: 'pinned'; branch: string; drift?: 'branch-changed' | 'unavailable' }
  /** No pin: Close follows the project target (shown without any availability claim). */
  | { kind: 'project'; branch: string }
  | { kind: 'none' };

/**
 * Integration target an EXISTING workspace brings along. Only the workspace's own pin counts;
 * the pinned branch is a creation-time value, not the live branch of the target.
 */
export function inheritedTarget(options: DemoCreateOptions, workspace: Workspace): InheritedTarget {
  const pin = workspace.integrationDestination;
  if (pin) {
    const target = options.workspaces.find((w) => w.workspaceId === pin.workspaceId);
    let drift: 'branch-changed' | 'unavailable' | undefined;
    if (target && target.branch !== pin.branch) drift = 'branch-changed';
    else if (target?.integrationSelectable !== true) drift = 'unavailable';
    return { kind: 'pinned', branch: pin.branch, ...(drift ? { drift } : {}) };
  }
  return options.integrationTargetBranch
    ? { kind: 'project', branch: options.integrationTargetBranch }
    : { kind: 'none' };
}

export type WorkspaceErrors = Partial<
  Record<'tile' | 'existing' | 'base' | 'target' | 'branch', Message>
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
export function revalidate(choice: WorkspaceChoice, options: DemoCreateOptions): WorkspaceErrors {
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
  if (choice.branch.on && choice.branch.name.trim()) {
    const error = branchNameError(choice.branch.name, options);
    if (error) errors.branch = error;
  }
  return errors;
}

/** The blocking problems of the active tile, ordered like the footer prerequisite. */
export function problems(choice: WorkspaceChoice, options: DemoCreateOptions): Message[] {
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
    if (choice.branch.on) {
      const error = branchNameError(choice.branch.name, options);
      if (error) list.push(error);
    }
  }
  return list;
}

/**
 * Value a freshly enabled "Zacznij od" switch starts with: the effective default, so turning the
 * switch on never shows an empty select. A `HEAD` default maps to the primary workspace branch
 * when that branch is a listed ref; otherwise there is nothing honest to preselect.
 */
export function defaultBaseValue(options: DemoCreateOptions): string {
  const listed = (ref?: string) =>
    ref && options.baseRefs.some((item) => item.ref === ref) ? ref : '';
  return options.defaultBaseRef === 'HEAD'
    ? listed(primaryWorkspace(options)?.branch)
    : listed(options.defaultBaseRef);
}
// There is deliberately no default for the "Scal później" switch: turning it on preselects
// nothing. `integrationTargetWorkspaceId` is sent only after the user picks a target, because
// any explicit selector creates an immutable PIN, unlike leaving the field out (follow the project).

/**
 * The request-relevant part of the choice. UI-only state (`settingsOpen`, declined suggestions)
 * is deliberately absent: opening the disclosure is neither an edit nor a reason to retire a
 * failure alert or to ask for a leave confirmation.
 */
export function requestChoiceSnapshot(choice: WorkspaceChoice) {
  return {
    tile: choice.tile,
    base: choice.base,
    target: choice.target,
    branch: choice.branch,
    existingWorkspaceId: choice.existingWorkspaceId,
  };
}

export interface CreateTargetFields {
  title: string;
  target?: DemoCreateTarget;
}

/** The workspace part of the request: only the active tile and only real overrides. */
export function buildCreateTarget(
  choice: WorkspaceChoice,
  options: DemoCreateOptions,
): DemoCreateTarget | undefined {
  const tile = activeTile(choice, options);
  if (tile === 'existing' && choice.existingWorkspaceId)
    return { kind: 'existing', workspaceId: choice.existingWorkspaceId };
  if (tile !== 'new') return undefined;
  const branch = choice.branch.name.trim();
  return {
    kind: 'new-worktree',
    ...(choice.base.on && choice.base.ref ? { baseRef: choice.base.ref } : {}),
    ...(choice.branch.on && branch ? { branch } : {}),
    ...(choice.target.on && choice.target.workspaceId
      ? { integrationTargetWorkspaceId: choice.target.workspaceId }
      : {}),
  };
}

export function buildCreateRequest(
  choice: WorkspaceChoice,
  options: DemoCreateOptions,
  title: string,
  operationId: string,
): CreateTargetFields & { operationId: string } {
  const target = buildCreateTarget(choice, options);
  return { title: title.trim(), operationId, ...(target ? { target } : {}) };
}

/** Summary of the real overrides, e.g. `2 changes: base, target`. */
export const defaultSettingsSummary: Message = message('create.workspace.settings.default');
export function settingsSummary(choice: WorkspaceChoice): Message {
  const names: Message[] = [];
  if (choice.base.on && choice.base.ref) names.push(message('create.workspace.settings.nameBase'));
  if (choice.target.on && choice.target.workspaceId)
    names.push(message('create.workspace.settings.nameTarget'));
  if (choice.branch.on && choice.branch.name.trim())
    names.push(message('create.workspace.settings.nameBranch'));
  if (names.length === 0) return defaultSettingsSummary;
  return message('create.workspace.settings.changed', { count: names.length, names });
}

export type MergeSuggestion =
  | { kind: 'offer'; workspaceId: string; branch: string; current?: string }
  | { kind: 'dirty'; branch: string };

/** Contextual merge-back offer after the base is a registered workspace branch (never automatic). */
export function mergeSuggestion(
  choice: WorkspaceChoice,
  options: DemoCreateOptions,
): MergeSuggestion | undefined {
  if (!choice.base.on || !choice.base.ref) return undefined;
  // Strictly an optional idea: nothing here is ever sent unless the user accepts the offer.
  const checkedOut = options.baseRefs.find((b) => b.ref === choice.base.ref)?.checkedOutWorkspaceId;
  const workspace = options.workspaces.find((w) => w.workspaceId === checkedOut);
  if (!workspace?.branch || workspace.workspaceId === options.primaryWorkspaceId) return undefined;
  if (choice.dismissedSuggestions[workspace.workspaceId]) return undefined;
  if (choice.target.on && choice.target.workspaceId === workspace.workspaceId) return undefined;
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
  options: DemoCreateOptions,
): string | undefined {
  if (choice.target.on)
    return choice.target.workspaceId
      ? options.workspaces.find((w) => w.workspaceId === choice.target.workspaceId)?.branch
      : undefined;
  return options.integrationTargetBranch;
}

const stageKeys: Readonly<Record<string, Message>> = {
  'workspace-prepared': message('create.operation.stageWorkspacePrepared'),
};
/** Reader-facing stage of a half-finished operation; an unknown server step is a diagnostic code shown as it is. */
export const operationStageLabel = (step: string): Message | string => stageKeys[step] ?? step;
/** Localised "last attempt" time; an unreadable value is shown as it is. */
export function formatOperationTime(iso: string, locale: string): string {
  const time = new Date(iso);
  return Number.isNaN(time.getTime())
    ? iso
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(time);
}
