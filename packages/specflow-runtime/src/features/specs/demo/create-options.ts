import type {
  DemoCreateErrorCode,
  DemoCreateOptions,
  DemoCreateTarget,
} from '@nevo/specflow-contracts/demo';

/**
 * Synthetic workspace registry, create-options scenarios and target validation of the demo.
 * Pure functions only: the in-memory state lives in `creation-state.ts`.
 */
export type DemoWorkspace = DemoCreateOptions['workspaces'][number];

const uuid = (n: number) => `0b8f1c1e-0a11-4c6e-9a01-${String(n).padStart(12, '0')}`;
export const demoWorkspaceIds = {
  main: uuid(1),
  platform: uuid(2),
  payments: uuid(3),
  architecture: uuid(4),
  spike: uuid(5),
  legacy: uuid(6),
} as const;

/** Synthetic machine layout: the repository folder and the folder that receives worktrees. */
export const demoRepositoryName = 'acme-app';
export const demoWorktreesRoot = '/work/acme-app-worktrees';
const linkedPath = (folder: string) => `${demoWorktreesRoot}/${folder}`;

const destination = (workspaceId: string, branch: string) => ({ workspaceId, branch });

/**
 * Engine rule of `integrationSelectable`: a workspace can be an explicit integration target only
 * when it is clean and on a local branch (`state === 'available'`) and is the primary or a
 * Nevo-managed linked workspace.
 */
export const isIntegrationSelectable = (workspace: DemoWorkspace) =>
  workspace.state === 'available' && (workspace.kind === 'primary' || workspace.managed);

/**
 * Brings a workspace list in line with the Engine invariants: `integrationSelectable` can only be
 * true when {@link isIntegrationSelectable} holds,
 * a pin exists only on linked workspaces and never points at its own workspace.
 */
function normalize(options: DemoCreateOptions): DemoCreateOptions {
  options.workspaces = options.workspaces.map((workspace) => {
    const next: DemoWorkspace = {
      ...workspace,
      integrationSelectable:
        workspace.integrationSelectable === true && isIntegrationSelectable(workspace),
    };
    const pin = workspace.integrationDestination;
    if (workspace.kind !== 'linked' || pin?.workspaceId === workspace.workspaceId)
      delete next.integrationDestination;
    return next;
  });
  return options;
}

/** Default seed: the realistic happy path (IMPLEMENTATION-SPEC section 2). */
export function seedCreateOptions(): DemoCreateOptions {
  const ids = demoWorkspaceIds;
  return {
    primaryWorkspaceId: ids.main,
    workspaces: [
      {
        workspaceId: ids.main,
        kind: 'primary',
        name: demoRepositoryName,
        path: '/work/acme-app',
        // The Engine never marks the primary workspace as Nevo-managed and gives it no pin.
        managed: false,
        specCount: 0,
        state: 'available',
        selectable: true,
        integrationSelectable: true,
        branch: 'develop',
      },
      {
        workspaceId: ids.platform,
        kind: 'linked',
        name: 'platform',
        path: linkedPath('platform'),
        managed: true,
        specCount: 2,
        state: 'available',
        selectable: true,
        integrationSelectable: true,
        branch: 'feature/platform',
      },
      {
        workspaceId: ids.payments,
        kind: 'linked',
        name: 'payments',
        path: linkedPath('payments'),
        managed: true,
        specCount: 1,
        state: 'dirty',
        selectable: true,
        integrationSelectable: false,
        // Pinned at creation to the primary workspace (develop): the Existing tile shows it.
        integrationDestination: destination(ids.main, 'develop'),
        branch: 'feature/payments',
        reason: 'dirty',
      },
      {
        workspaceId: ids.architecture,
        kind: 'linked',
        name: 'architecture',
        path: linkedPath('architecture'),
        managed: true,
        specCount: 3,
        state: 'available',
        selectable: true,
        integrationSelectable: true,
        branch: 'spec/architecture',
      },
      {
        workspaceId: ids.spike,
        kind: 'linked',
        name: 'spike',
        path: linkedPath('spike'),
        managed: true,
        specCount: 0,
        state: 'detached',
        selectable: false,
        integrationSelectable: false,
        reason: 'detached',
      },
      {
        workspaceId: ids.legacy,
        kind: 'linked',
        name: 'legacy',
        path: linkedPath('legacy'),
        managed: true,
        specCount: 1,
        state: 'unavailable',
        selectable: false,
        integrationSelectable: false,
        reason: 'checkout-unavailable',
      },
    ],
    newWorktree: { status: 'available' },
    defaultBaseRef: 'develop',
    branchPattern: 'feature/{slug}',
    worktreesRoot: { path: demoWorktreesRoot, exists: true },
    integrationTargetBranch: 'develop',
    baseRefs: [
      { ref: 'develop', checkedOutWorkspaceId: ids.main },
      { ref: 'feature/platform', checkedOutWorkspaceId: ids.platform },
      { ref: 'feature/payments', checkedOutWorkspaceId: ids.payments },
      { ref: 'spec/architecture', checkedOutWorkspaceId: ids.architecture },
      { ref: 'release/1.4' },
      { ref: 'main' },
      { ref: 'feature/legacy' },
    ],
  };
}

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
] as const;
export type DemoOptionsScenario = (typeof demoOptionsScenarios)[number];
export type DemoOptionsFailureScenario = (typeof demoOptionsFailureScenarios)[number];
export type DemoCreateScenario = (typeof demoCreateScenarios)[number];
export type DemoScenario = DemoOptionsScenario | DemoOptionsFailureScenario | DemoCreateScenario;
const allScenarios: readonly string[] = [
  ...demoOptionsScenarios,
  ...demoOptionsFailureScenarios,
  ...demoCreateScenarios,
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
      break;
    case 'git-unavailable':
      next.newWorktree = { status: 'unavailable', reason: 'git-unavailable' };
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

/** Git-ref syntax check for a requested branch name. */
export function isValidBranchName(branch: string): boolean {
  if (!branch || branch.length > 200) return false;
  if (/[\s~^:?*[\\]/.test(branch)) return false;
  if ([...branch].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return false;
  if (branch.startsWith('/') || branch.startsWith('-') || branch === '@') return false;
  if (branch.endsWith('/') || branch.endsWith('.')) return false;
  if (branch.includes('..') || branch.includes('@{')) return false;
  return !branch.split('/').some((part) => !part || part.startsWith('.') || part.endsWith('.lock'));
}

/** ASCII slug of a title (Polish diacritics folded). */
export function slugify(title: string): string {
  const folded = title.trim().toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const slug = folded
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'specification';
}

export class DemoTargetError extends Error {
  readonly status: 400 | 403 | 409 | 422 | 503;
  /** `'forbidden'` has no wire code: a 403 answers `{ error: 'forbidden' }` only. */
  readonly code: DemoCreateErrorCode | 'forbidden';
  constructor(
    status: 400 | 403 | 409 | 422 | 503,
    code: DemoCreateErrorCode | 'forbidden',
    message: string,
  ) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface ResolvedTarget {
  kind: 'main' | 'existing' | 'new-worktree';
  /** Workspace that receives the spec (existing/main) — undefined for a not-yet-created worktree. */
  workspaceId?: string;
  /** Branch of the new worktree (explicit or generated). */
  branch?: string;
  baseRef: string;
  integrationTargetWorkspaceId?: string;
}

const taken = (options: DemoCreateOptions, branch: string) =>
  options.baseRefs.some((b) => b.ref === branch) ||
  options.workspaces.some((w) => w.branch === branch);

/**
 * Validates a create `target` against the current options and resolves what Create would do.
 * Throws `DemoTargetError` with the mapped demo error code.
 */
export function resolveTarget(
  options: DemoCreateOptions,
  target: DemoCreateTarget | undefined,
  slug: string,
): ResolvedTarget {
  const unavailable = (message: string) =>
    new DemoTargetError(409, 'DEMO_WORKSPACE_UNAVAILABLE', message);
  if (!target) {
    const primary = options.workspaces.find((w) => w.workspaceId === options.primaryWorkspaceId);
    if (!primary?.selectable) throw unavailable('Bieżący katalog nie jest teraz dostępny.');
    return { kind: 'main', workspaceId: primary.workspaceId, baseRef: primary.branch ?? 'HEAD' };
  }
  if (target.kind === 'existing') {
    const workspace = options.workspaces.find((w) => w.workspaceId === target.workspaceId);
    if (!workspace?.selectable)
      throw unavailable('Wybrane środowisko pracy nie jest już dostępne.');
    return {
      kind: 'existing',
      workspaceId: workspace.workspaceId,
      baseRef: workspace.branch ?? 'HEAD',
    };
  }
  if (options.newWorktree.status !== 'available')
    throw unavailable('Tworzenie nowego środowiska pracy nie jest teraz dostępne.');
  const baseRef = target.baseRef ?? options.defaultBaseRef;
  if (target.baseRef !== undefined && !options.baseRefs.some((b) => b.ref === target.baseRef))
    throw new DemoTargetError(422, 'BASE_REF_NOT_FOUND', 'BASE_REF_NOT_FOUND');
  if (target.integrationTargetWorkspaceId !== undefined) {
    const workspace = options.workspaces.find(
      (w) => w.workspaceId === target.integrationTargetWorkspaceId,
    );
    if (workspace?.integrationSelectable !== true)
      // Like the Engine: an unusable explicit target is plain `CREATE_OPERATION_INVALID`.
      throw new DemoTargetError(400, 'CREATE_OPERATION_INVALID', 'CREATE_OPERATION_INVALID');
  }
  let branch = target.branch?.trim();
  if (target.branch !== undefined) {
    if (!branch || !isValidBranchName(branch))
      throw new DemoTargetError(400, 'CREATE_OPERATION_INVALID', 'CREATE_OPERATION_INVALID');
    if (taken(options, branch))
      throw new DemoTargetError(409, 'BRANCH_ALREADY_EXISTS', 'BRANCH_ALREADY_EXISTS');
  } else {
    const base = options.branchPattern.replace('{slug}', slug);
    branch = base;
    for (let n = 2; taken(options, branch); n += 1) branch = `${base}-${n}`;
  }
  return {
    kind: 'new-worktree',
    branch,
    baseRef,
    ...(target.integrationTargetWorkspaceId !== undefined
      ? { integrationTargetWorkspaceId: target.integrationTargetWorkspaceId }
      : {}),
  };
}
