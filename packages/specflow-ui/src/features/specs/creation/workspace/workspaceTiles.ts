import type { CreateOptions } from '@nevo/specflow-contracts/specs';
import { message, type Message } from '../../../../i18n/message';
import type { Tile, WorkspaceChoice } from './workspaceChoice';

type Workspace = CreateOptions['workspaces'][number];

export const primaryWorkspace = (options: CreateOptions) =>
  options.workspaces.find((w) => w.workspaceId === options.primaryWorkspaceId);
const linkedWorkspaces = (options: CreateOptions) =>
  options.workspaces.filter((w) => w.kind === 'linked');

/** The Engine does not commit on this workspace's branch (project configuration, Git enabled). */
export const isProtectedReason = (reason?: string): boolean =>
  reason === 'branch-protected' || reason === 'branch-not-allowed';

export interface TileAvailability {
  ok: boolean;
  /** Unavailable because of the project's protected-branch policy: a new workspace is the way out. */
  protected?: true;
  /** Visible reason that replaces the description when the tile is unavailable. */
  reason?: Message;
  /** Selectable linked workspaces (existing tile). */
  count?: number;
}

export function tileAvailability(options: CreateOptions): Record<Tile, TileAvailability> {
  const created = options.newWorktree;
  const primary = primaryWorkspace(options);
  const linked = linkedWorkspaces(options);
  const selectable = linked.filter((w) => w.selectable);
  // Every linked checkout that has a branch is on one the Engine will not commit on (workspaces
  // without a branch are unusable anyway and are not candidates).
  const branched = linked.filter((w) => w.branch);
  const allProtected = branched.length > 0 && branched.every((w) => isProtectedReason(w.reason));
  return {
    new:
      created.status === 'available'
        ? { ok: true }
        : {
            ok: false,
            reason: message(
              created.reason === 'git-policy-invalid'
                ? 'create.workspace.tileReason.newPolicyInvalid'
                : created.status === 'disabled'
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
      : isProtectedReason(primary?.reason)
        ? {
            ok: false,
            protected: true,
            reason: message(
              primary?.reason === 'branch-not-allowed'
                ? 'create.workspace.tileReason.mainNotAllowed'
                : 'create.workspace.tileReason.mainProtected',
              { branch: primary?.branch ?? '' },
            ),
          }
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
          ? allProtected
            ? {
                ok: false,
                protected: true,
                reason: message('create.workspace.tileReason.existingProtected'),
              }
            : { ok: false, reason: message('create.workspace.tileReason.existingUnavailable') }
          : { ok: true, count: selectable.length },
  };
}

/** Initial tile only; after the user picks one it never jumps silently. */
export function defaultTile(options: CreateOptions): Tile | null {
  const availability = tileAvailability(options);
  return (['new', 'main', 'existing'] as const).find((tile) => availability[tile].ok) ?? null;
}
export const activeTile = (choice: WorkspaceChoice, options: CreateOptions): Tile | null =>
  choice.tile ?? defaultTile(options);

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
export function targetStatus(options: CreateOptions): TargetStatus {
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
export function inheritedTarget(options: CreateOptions, workspace: Workspace): InheritedTarget {
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

/**
 * Value a freshly enabled "Zacznij od" switch starts with: the effective default, so turning the
 * switch on never shows an empty select. A `HEAD` default maps to the primary workspace branch
 * when that branch is a listed ref; otherwise there is nothing honest to preselect.
 */
export function defaultBaseValue(options: CreateOptions): string {
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
export function defaultTargetWorkspaceId(options: CreateOptions): string {
  const status = targetStatus(options);
  return status.kind === 'ok' ? status.workspace.workspaceId : '';
}
