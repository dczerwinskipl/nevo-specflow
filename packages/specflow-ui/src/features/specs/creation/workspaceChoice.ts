import type { DemoCreateOptions, DemoCreateTarget } from '@nevo/specflow-contracts/demo';
import { deriveSpecSlug, specSlugProblem } from '@nevo/specflow-contracts/specs';
import { message, type Message } from '../../../i18n/message';

/**
 * Pure policy of the "Gdzie chcesz pracować?" section: which tiles are available, what the
 * request carries, and which stale values must be flagged. A switched-on setting starts from the
 * effective default (so the owner only adjusts), but only a value that differs from that default is
 * ever sent: the UI forwards a real override or nothing.
 */
export type Tile = 'new' | 'main' | 'existing';
type Workspace = DemoCreateOptions['workspaces'][number];

export interface WorkspaceChoice {
  /** `null` = untouched: the tile follows {@link defaultTile} until the user picks one. */
  tile: Tile | null;
  base: { on: boolean; ref: string };
  target: { on: boolean; workspaceId: string };
  /** `edited`: the owner typed a name; until then the field shows the generated default. */
  branch: { on: boolean; name: string; edited: boolean };
  /** `edited`: the owner typed a slug; until then the field follows the title. */
  slug: { on: boolean; value: string; edited: boolean };
  existingWorkspaceId: string;
  settingsOpen: boolean;
  /** Merge-back suggestions the user declined, per workspace id. */
  dismissedSuggestions: Record<string, true>;
}

export const initialWorkspaceChoice: WorkspaceChoice = {
  tile: null,
  base: { on: false, ref: '' },
  target: { on: false, workspaceId: '' },
  branch: { on: false, name: '', edited: false },
  slug: { on: false, value: '', edited: false },
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
    if (choice.slug.on && choice.slug.edited) {
      const error = slugError(choice.slug.value);
      if (error) list.push(error);
    }
    if (choice.branch.on && choice.branch.edited) {
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

/**
 * Workspace the project's default integration target resolves to: the PRIMARY workspace when it is
 * on the target branch and usable as a target, otherwise none. A freshly enabled "merge into"
 * switch starts with it. An untouched default is never sent: an explicit selector creates an
 * immutable PIN, while omission keeps following the project (see {@link buildCreateTarget}).
 */
export function defaultTargetWorkspaceId(options: DemoCreateOptions): string {
  const status = targetStatus(options);
  return status.kind === 'ok' ? status.workspace.workspaceId : '';
}

/** Slug the Engine derives from the title (shared rule); empty while the title has no usable text. */
export const derivedSlug = (title: string): string => deriveSpecSlug(title);

/** Slug in effect: the typed one when the owner edited it, otherwise the title-derived one. */
export function effectiveSlug(choice: WorkspaceChoice, title: string): string {
  return choice.slug.on && choice.slug.edited ? choice.slug.value : derivedSlug(title);
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

/**
 * The generated branch for a slug, written like the configured pattern. The random id part
 * (`{shortId}`) is unknown before creation and is shown as `<id>`; an unknown slug as `<slug>`.
 */
export function branchPreview(options: DemoCreateOptions, slug: string): string {
  return options.branchPattern
    .replaceAll('{slug}', slug || '<slug>')
    .replaceAll('{shortId}', '<id>');
}

/**
 * Starting value of "use your own branch name": the generated name without the random id, which an
 * owner cannot predict, so the result is a name they can adjust. Equal to the generated name only
 * when the pattern has no `{shortId}`.
 */
export function branchPrefill(options: DemoCreateOptions, slug: string): string {
  if (!slug) return '';
  return options.branchPattern
    .replaceAll('{slug}', slug)
    .replaceAll('{shortId}', '')
    .replace(/[-_./]+$/u, '');
}

/** The branch name the owner sees in the field: their own edit, else the prefilled default. */
export function branchFieldValue(
  choice: WorkspaceChoice,
  options: DemoCreateOptions,
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
  options: DemoCreateOptions,
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
  if (slug && slug !== derivedSlug(title)) overrides.slug = slug;
  const branch = choice.branch.on && choice.branch.edited ? choice.branch.name.trim() : '';
  const exactDefault = options.branchPattern.includes('{shortId}')
    ? undefined
    : branchPrefill(options, effectiveSlug(choice, title));
  if (branch && branch !== exactDefault) overrides.branch = branch;
  return overrides;
}

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
    slug: choice.slug,
    existingWorkspaceId: choice.existingWorkspaceId,
  };
}

export interface CreateTargetFields {
  title: string;
  slug?: string;
  target?: DemoCreateTarget;
}

/** The workspace part of the request: only the active tile and only real overrides. */
export function buildCreateTarget(
  choice: WorkspaceChoice,
  options: DemoCreateOptions,
  title = '',
): DemoCreateTarget | undefined {
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
  options: DemoCreateOptions,
  title: string,
): string | undefined {
  return activeTile(choice, options) === 'new'
    ? createOverrides(choice, options, title).slug
    : undefined;
}

export function buildCreateRequest(
  choice: WorkspaceChoice,
  options: DemoCreateOptions,
  title: string,
  operationId: string,
): CreateTargetFields & { operationId: string } {
  const target = buildCreateTarget(choice, options, title);
  const slug = buildCreateSlug(choice, options, title);
  return {
    title: title.trim(),
    operationId,
    ...(slug ? { slug } : {}),
    ...(target ? { target } : {}),
  };
}

/** Summary of the real overrides, e.g. `2 changes: base, target`. */
export const defaultSettingsSummary: Message = message('create.workspace.settings.default');
export function settingsSummary(
  choice: WorkspaceChoice,
  options: DemoCreateOptions,
  title: string,
): Message {
  const overrides = createOverrides(choice, options, title);
  const names: Message[] = [];
  if (overrides.baseRef) names.push(message('create.workspace.settings.nameBase'));
  if (overrides.integrationTargetWorkspaceId)
    names.push(message('create.workspace.settings.nameTarget'));
  if (overrides.slug) names.push(message('create.workspace.settings.nameSlug'));
  if (overrides.branch) names.push(message('create.workspace.settings.nameBranch'));
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
