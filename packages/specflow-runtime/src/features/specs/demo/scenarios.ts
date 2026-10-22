import type { DemoCreateOptions } from '@nevo/specflow-contracts/demo';

import {
  demoWorkspaceIds,
  destination,
  linkedPath,
  normalize,
  uuid,
  type DemoWorkspace,
} from './seed';

/**
 * Options-shaping, Create-outcome and operation-list scenarios of the demo seam, their parser and
 * the applier that turns the default seed into one scenario. Pure functions only.
 */

/** Options-shaping scenarios (applied to GET and to validation of POST). */
export const demoOptionsScenarios = [
  'default',
  'git-disabled',
  'git-unavailable',
  'membership-mismatch',
  'no-linked',
  'linked-none-selectable',
  'none-available',
  'no-integration-target',
  'target-dirty',
  'platform-dirty',
  'primary-dirty',
  'primary-other-branch',
  'pin-drift',
  'primary-detached',
  'head-base',
  'head-base-no-branch',
  'many-workspaces',
  'managed-false',
  'long-names',
  /** The primary checkout is on a protected branch (`main`): its tile is not selectable. */
  'protected-primary',
  /** Every linked workspace is on a protected branch, the primary one is not. */
  'protected-all-linked',
  /** The generated branch name (`release/<slug>`) is protected: a typed name has to be used. */
  'new-branch-protected',
  /**
   * The Git section of the configuration is invalid: workspaces are listed but not selectable, the
   * Git part is unavailable (`git-policy-invalid`) and a Create fails closed with 503.
   */
  'git-policy-invalid',
] as const;
/** Scenarios that fail the options read itself. */
export const demoOptionsFailureScenarios = ['options-forbidden', 'options-error'] as const;
/** Scenarios that force a Create outcome. */
export const demoCreateScenarios = [
  'branch-taken',
  'stale-workspace',
  'integration-target-unavailable',
  'base-ref-unavailable',
  'forbidden',
  'recovery-required',
  'recovery-resolved',
  'network-uncertain',
  /** The Engine refuses to commit on the target's branch (422, nothing created). */
  'branch-protected',
  /** The checkout cannot take a commit now (409, nothing created). */
  'commit-blocked',
  /** The scoped commit failed after the files were written (503, recovery required). */
  'commit-failed',
  /** Paces the Create progress steps so a live checklist can be observed. */
  'slow-create',
] as const;
/** Scenarios of the operation list. */
export const demoOperationScenarios = [
  /** Seeds every list status: running (with steps), interrupted, recovery, failed, completed. */
  'operations-panel',
] as const;
export type DemoOptionsScenario = (typeof demoOptionsScenarios)[number];
export type DemoOptionsFailureScenario = (typeof demoOptionsFailureScenarios)[number];
export type DemoCreateScenario = (typeof demoCreateScenarios)[number];
export type DemoOperationScenario = (typeof demoOperationScenarios)[number];
export type DemoScenario =
  DemoOptionsScenario | DemoOptionsFailureScenario | DemoCreateScenario | DemoOperationScenario;
const allScenarios: readonly string[] = [
  ...demoOptionsScenarios,
  ...demoOptionsFailureScenarios,
  ...demoCreateScenarios,
  ...demoOperationScenarios,
];

/** Parses a comma-separated scenario list. Returns `undefined` when any name is unknown. */
export function parseScenarios(raw: string | undefined): DemoScenario[] | undefined {
  if (!raw?.trim()) return [];
  const names = raw
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  return names.every((name) => allScenarios.includes(name)) ? (names as DemoScenario[]) : undefined;
}

const dirtyFlags = (workspace: DemoWorkspace) => ({
  ...workspace,
  state: 'dirty' as const,
  integrationSelectable: false,
  reason: 'dirty' as const,
});
const notSelectable = (workspace: DemoWorkspace): DemoWorkspace => ({
  ...workspace,
  selectable: false,
  integrationSelectable: false,
  state: workspace.state === 'dirty' ? 'unavailable' : workspace.state,
  reason: 'checkout-unavailable',
});
function strip(workspace: DemoWorkspace): DemoWorkspace {
  const copy: Record<string, unknown> = { ...workspace };
  for (const key of Object.keys(copy)) if (copy[key] === undefined) delete copy[key];
  return copy as unknown as DemoWorkspace;
}

/** Returns a modified copy of `options` for one options scenario. */
export function applyOptionsScenario(
  options: DemoCreateOptions,
  scenario: DemoOptionsScenario,
): DemoCreateOptions {
  const next = structuredClone(options);
  const primary = () => next.workspaces.find((w) => w.kind === 'primary')!;
  const map = (fn: (w: DemoWorkspace) => DemoWorkspace, only?: (w: DemoWorkspace) => boolean) => {
    next.workspaces = next.workspaces.map((w) => strip(!only || only(w) ? fn(w) : w));
  };
  switch (scenario) {
    case 'default':
      break;
    case 'git-disabled':
      next.newWorktree = { status: 'disabled', reason: 'git-disabled' };
      next.workspaces = [
        strip({
          ...primary(),
          branch: undefined,
          integrationDestination: undefined,
          integrationSelectable: false,
        }),
      ];
      next.baseRefs = [];
      next.defaultBaseRef = 'HEAD';
      delete next.integrationTargetBranch;
      // Git off: the Engine does not commit, so no commit-related field exists at all.
      delete next.commits;
      break;
    case 'git-unavailable':
      next.newWorktree = { status: 'unavailable', reason: 'git-unavailable' };
      break;
    case 'git-policy-invalid':
      next.newWorktree = { status: 'unavailable', reason: 'git-policy-invalid' };
      next.workspaces = next.workspaces.map((w) =>
        strip({
          ...w,
          selectable: false,
          integrationSelectable: false,
          state: 'unavailable',
          reason: 'git-policy-invalid',
        }),
      );
      next.baseRefs = [];
      next.defaultBaseRef = 'HEAD';
      delete next.integrationTargetBranch;
      // Nothing about Git is known: no commit-related field either.
      delete next.commits;
      break;
    case 'membership-mismatch':
      next.newWorktree = { status: 'unavailable', reason: 'git-membership-mismatch' };
      break;
    case 'no-linked':
      next.workspaces = [primary()];
      break;
    case 'linked-none-selectable':
      map(notSelectable, (w) => w.kind === 'linked');
      break;
    case 'none-available':
      next.workspaces = next.workspaces.map((w) =>
        strip(
          w.kind === 'primary' ? { ...notSelectable(w), state: 'unavailable' } : notSelectable(w),
        ),
      );
      break;
    case 'no-integration-target':
      delete next.integrationTargetBranch;
      break;
    case 'target-dirty':
    case 'primary-dirty':
      map(dirtyFlags, (w) => w.kind === 'primary');
      break;
    case 'platform-dirty':
      map(dirtyFlags, (w) => w.workspaceId === demoWorkspaceIds.platform);
      break;
    case 'primary-other-branch':
      // The project target branch (develop) is held by a LINKED workspace while the primary
      // workspace sits elsewhere: Close would refuse, so the project target is not available.
      next.workspaces = next.workspaces.map((w) =>
        strip(
          w.kind === 'primary'
            ? { ...w, branch: 'release/1.4' }
            : w.workspaceId === demoWorkspaceIds.platform
              ? { ...w, branch: 'develop' }
              : w,
        ),
      );
      next.baseRefs = [
        { ref: 'develop', checkedOutWorkspaceId: demoWorkspaceIds.platform },
        { ref: 'release/1.4', checkedOutWorkspaceId: demoWorkspaceIds.main },
        ...next.baseRefs.filter(
          (b) => !['develop', 'feature/platform', 'release/1.4'].includes(b.ref),
        ),
      ];
      break;
    case 'pin-drift':
      // The pinned target (primary) has since moved to another branch: Close would refuse.
      map(
        (w) => ({
          ...w,
          integrationDestination: destination(demoWorkspaceIds.main, 'release/1.3'),
        }),
        (w) => w.workspaceId === demoWorkspaceIds.payments,
      );
      break;
    case 'primary-detached':
      next.workspaces = next.workspaces.map((w) =>
        strip(
          w.kind === 'primary'
            ? {
                ...w,
                branch: undefined,
                state: 'detached',
                selectable: false,
                integrationSelectable: false,
                integrationDestination: undefined,
                reason: 'detached',
              }
            : w,
        ),
      );
      next.defaultBaseRef = 'HEAD';
      break;
    case 'head-base':
      next.defaultBaseRef = 'HEAD';
      break;
    case 'head-base-no-branch':
      next.defaultBaseRef = 'HEAD';
      next.workspaces = next.workspaces.map((w) =>
        strip(w.kind === 'primary' ? { ...w, branch: undefined } : w),
      );
      delete next.integrationTargetBranch;
      break;
    case 'many-workspaces':
      for (let index = 0; index < 8; index += 1) {
        const workspaceId = uuid(100 + index);
        const branch = `feature/team-${index + 1}`;
        next.workspaces.push({
          workspaceId,
          kind: 'linked',
          name: `team-${index + 1}`,
          path: linkedPath(`team-${index + 1}`),
          managed: true,
          specCount: index % 4,
          state: 'available',
          selectable: true,
          integrationSelectable: true,
          branch,
        });
        next.baseRefs.push({ ref: branch, checkedOutWorkspaceId: workspaceId });
      }
      break;
    case 'protected-primary':
      next.workspaces = next.workspaces.map((w) =>
        strip(
          w.kind === 'primary'
            ? {
                ...w,
                branch: 'main',
                selectable: false,
                integrationSelectable: true,
                reason: 'branch-protected',
              }
            : w,
        ),
      );
      next.baseRefs = next.baseRefs.map((b) =>
        b.ref === 'develop'
          ? { ref: b.ref }
          : b.ref === 'main'
            ? { ...b, checkedOutWorkspaceId: demoWorkspaceIds.main }
            : b,
      );
      break;
    case 'protected-all-linked':
      next.commits = { protectedBranches: ['main', 'feature/**', 'spec/**'] };
      map(
        (w) => ({ ...w, selectable: false, reason: 'branch-protected' }),
        (w) => w.kind === 'linked' && w.branch !== undefined,
      );
      break;
    case 'new-branch-protected':
      next.branchPattern = 'release/{slug}';
      next.commits = { protectedBranches: ['main', 'release/**'] };
      next.newWorktree = { status: 'available', branchProtected: true };
      break;
    case 'managed-false':
      map(
        (w) => ({ ...w, managed: false }),
        (w) => w.workspaceId === demoWorkspaceIds.architecture,
      );
      break;
    case 'long-names': {
      const long = 'feature/platform/very-long-descriptive-branch-name-for-overflow-checks-0001';
      next.workspaces = next.workspaces.map((w) =>
        strip(w.workspaceId === demoWorkspaceIds.platform ? { ...w, branch: long } : w),
      );
      next.baseRefs = next.baseRefs.map((b) =>
        b.ref === 'feature/platform' ? { ...b, ref: long } : b,
      );
      break;
    }
  }
  return normalize(next);
}
