import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { GitCapabilityError } from '../../git/errors';
import { validateBaseRef, validateBranchName } from '../git/refs';
import { BRANCH_PATTERN_MAX_ENTRIES, branchPatternProblem } from '../commits/branch-patterns';

export { validateBaseRef, validateBranchName, normalizeBaseRef } from '../git/refs';

/**
 * Branches on which the Engine commits its own file changes. Committed Project Home configuration
 * only (`git.commits`); both lists are glob patterns on the short branch name and inert unless
 * `git.enabled`.
 */
export interface GitCommitsPolicy {
  readonly protectedBranches: readonly string[];
  readonly allowedBranches?: readonly string[];
  /** `git.commits.auto` exactly as configured; a capability that is absent here is not configured. */
  readonly auto?: AutoCommitSettings;
}

/**
 * Engine capabilities that have a manual commit over their ledger scope and an automatic-commit
 * setting of their own (ADR 0018). Extensible: a capability (later tasks, definitions, ...) is added by
 * the change that introduces it. The automatic setting is configuration only (never a per-request
 * option) and defaults to off.
 */
export const COMMIT_CAPABILITIES = ['documents'] as const;
export type CommitCapability = (typeof COMMIT_CAPABILITIES)[number];

/** `git.commits.auto.<capability>` values; a missing key means "not configured here" (the default is `false`: nothing is committed automatically unless the configuration enables it). */
export type AutoCommitSettings = Readonly<Partial<Record<CommitCapability, boolean>>>;

/** Where the effective value of `git.commits.auto.<capability>` comes from. */
export type AutoCommitSource = 'project' | 'local' | 'default';

export interface EffectiveAutoCommit {
  readonly auto: boolean;
  readonly source: AutoCommitSource;
}

/** Project Home is the only authority for operational Git policy. */
export interface GitWorktreePolicy {
  readonly enabled: boolean;
  readonly branchPattern: string;
  readonly baseRef: string;
  /** Independently configured destination for existing-worktree integration. */
  readonly integrationTargetBranch?: string;
  /** Nothing is protected by default (`protectedBranches: []`, no allow-list). */
  readonly commits: GitCommitsPolicy;
  /**
   * Workstation-local `git.worktreesRoot` exactly as configured (relative values are resolved
   * against the repository). Absent = the `<repo>-worktrees` default. Never committed.
   */
  readonly worktreesRoot?: string;
  /**
   * Workstation-local `git.commits.auto` exactly as configured. It wins over the committed value; it is
   * the only local `git.commits` key and never loosens a safety control.
   */
  readonly localAutoCommit?: AutoCommitSettings;
}

/** The effective `git.commits.auto.<capability>`: local, else committed, else `false` (ADR 0018 decisions 1 and 2, default off). */
export function effectiveAutoCommit(
  policy: GitWorktreePolicy,
  capability: CommitCapability,
): EffectiveAutoCommit {
  const local = policy.localAutoCommit?.[capability];
  if (local !== undefined) {
    return { auto: local, source: 'local' };
  }

  const project = policy.commits.auto?.[capability];
  if (project !== undefined) {
    return { auto: project, source: 'project' };
  }

  return { auto: false, source: 'default' };
}

/** The Specification key is part of the branch name (`feature/nevo-12-login`). */
export const DEFAULT_BRANCH_PATTERN = 'feature/{key}-{slug}';
export const DEFAULT_BASE_REF = 'HEAD';

const SUPPORTED_TEMPLATE_FIELDS = ['slug', 'shortId', 'key'] as const;

/** Pure parser. Call with Project Home config, never the linked checkout config. */
export function parseGitWorktreePolicy(
  projectConfig: unknown,
  localConfig?: unknown,
): GitWorktreePolicy {
  if (!isRecord(projectConfig)) {
    throw invalid('Project configuration must be an object.');
  }

  const { worktreesRoot, auto: localAutoCommit } = parseLocalGit(localConfig);

  const value = projectConfig.git;
  if (value === undefined) {
    return {
      enabled: false,
      branchPattern: DEFAULT_BRANCH_PATTERN,
      baseRef: DEFAULT_BASE_REF,
      commits: { protectedBranches: [] },
      ...(worktreesRoot !== undefined ? { worktreesRoot } : {}),
      ...(localAutoCommit !== undefined ? { localAutoCommit } : {}),
    };
  }

  if (!isRecord(value) || typeof value.enabled !== 'boolean') {
    throw invalid('Project git.enabled must be a boolean.');
  }

  if (
    Object.keys(value).some(
      (key) =>
        key !== 'enabled' &&
        key !== 'worktrees' &&
        key !== 'integrationTargetBranch' &&
        key !== 'commits',
    )
  ) {
    throw invalid('Unsupported Git policy key.');
  }

  const worktrees = value.worktrees;
  if (worktrees !== undefined && !isRecord(worktrees)) {
    throw invalid('git.worktrees must be an object.');
  }

  if (
    worktrees !== undefined &&
    Object.keys(worktrees).some((key) => key !== 'branchPattern' && key !== 'baseRef')
  ) {
    throw invalid('Unsupported git.worktrees policy key.');
  }

  const branchPattern = worktrees?.branchPattern ?? DEFAULT_BRANCH_PATTERN;
  const baseRef = worktrees?.baseRef ?? DEFAULT_BASE_REF;
  if (typeof branchPattern !== 'string' || typeof baseRef !== 'string') {
    throw invalid('Git worktree policy values must be strings.');
  }

  validateBranchPattern(branchPattern);
  validateBaseRef(baseRef);
  const target = value.integrationTargetBranch;
  if (target !== undefined) {
    if (typeof target !== 'string') {
      throw invalid('git.integrationTargetBranch must be a local branch.');
    }

    validateBranchName(target);
    if (target === 'HEAD') {
      throw invalid('Integration target must be a named local branch.');
    }
  }

  return {
    enabled: value.enabled,
    branchPattern,
    baseRef,
    ...(target !== undefined ? { integrationTargetBranch: target } : {}),
    commits: parseCommitsPolicy(value.commits),
    ...(worktreesRoot !== undefined ? { worktreesRoot } : {}),
    ...(localAutoCommit !== undefined ? { localAutoCommit } : {}),
  };
}

/**
 * `git.commits` is validated even while Git is disabled (a typo is found early) but is then inert.
 * This is the ONE validator of the commit policy: the policy reader and `init` both use it, so a
 * policy that `init` writes can never later yield `GIT_POLICY_INVALID`.
 */
export function parseCommitsPolicy(value: unknown): GitCommitsPolicy {
  if (value === undefined) {
    return { protectedBranches: [] };
  }

  if (!isRecord(value)) {
    throw invalid('git.commits must be an object.');
  }

  if (
    Object.keys(value).some(
      (key) => key !== 'protectedBranches' && key !== 'allowedBranches' && key !== 'auto',
    )
  ) {
    throw invalid('Unsupported git.commits policy key.');
  }

  const auto = parseAutoCommit('git.commits.auto', value.auto);
  const protectedBranches = parsePatternList(
    'git.commits.protectedBranches',
    value.protectedBranches,
  );
  const allowed =
    value.allowedBranches === undefined
      ? undefined
      : parsePatternList('git.commits.allowedBranches', value.allowedBranches);
  if (allowed?.some((pattern) => protectedBranches.includes(pattern))) {
    throw invalid('A branch pattern cannot be both protected and allowed.');
  }

  return {
    protectedBranches,
    ...(allowed !== undefined && allowed.length > 0 ? { allowedBranches: allowed } : {}),
    ...(auto !== undefined ? { auto } : {}),
  };
}

/** `git.commits.auto`: a closed set of capability keys with boolean values (committed and local alike). */
function parseAutoCommit(label: string, value: unknown): AutoCommitSettings | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw invalid(label + ' must be an object.');
  }

  const settings: Partial<Record<CommitCapability, boolean>> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!(COMMIT_CAPABILITIES as readonly string[]).includes(key)) {
      throw invalid(label + ' has an unknown capability.');
    }

    if (typeof entry !== 'boolean') {
      throw invalid(label + '.' + key + ' must be a boolean.');
    }

    settings[key as CommitCapability] = entry;
  }

  return settings;
}

function parsePatternList(label: string, value: unknown): readonly string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw invalid(label + ' must be a list of branch patterns.');
  }

  if (value.length > BRANCH_PATTERN_MAX_ENTRIES) {
    throw invalid(label + ' has too many entries.');
  }

  const patterns: string[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'string') {
      throw invalid(label + ' entries must be strings.');
    }

    const pattern = entry.trim();
    if (branchPatternProblem(pattern) !== undefined) {
      throw invalid(label + ' contains an invalid branch pattern.');
    }

    // A literal (wildcard-free) entry names one branch and must be a valid branch name.
    if (!/[*?[]/u.test(pattern)) {
      validateBranchName(pattern);
    }

    if (patterns.includes(pattern)) {
      throw invalid(label + ' contains a duplicate pattern.');
    }

    patterns.push(pattern);
  }

  return patterns;
}

/**
 * The workstation-local Git settings: `git.worktreesRoot` and `git.commits.auto` (ADR 0018 decision 2).
 * All other Git policy, protection included, is committed only.
 */
function parseLocalGit(localConfig: unknown): {
  readonly worktreesRoot?: string;
  readonly auto?: AutoCommitSettings;
} {
  if (!isRecord(localConfig) || localConfig.git === undefined) {
    return {};
  }

  const local = localConfig.git;
  if (
    !isRecord(local) ||
    Object.keys(local).some((key) => key !== 'worktreesRoot' && key !== 'commits')
  ) {
    throw invalid(
      'Only git.worktreesRoot and git.commits.auto can be set in workstation-local configuration.',
    );
  }

  let auto: AutoCommitSettings | undefined;
  if (local.commits !== undefined) {
    if (!isRecord(local.commits) || Object.keys(local.commits).some((key) => key !== 'auto')) {
      throw invalid('Only git.commits.auto can be set in workstation-local configuration.');
    }

    auto = parseAutoCommit('git.commits.auto', local.commits.auto);
  }

  const value = local.worktreesRoot;
  if (value === undefined) {
    return auto !== undefined ? { auto } : {};
  }

  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 1000 ||
    value.includes('\u0000')
  ) {
    throw invalid('git.worktreesRoot must be a non-empty path.');
  }

  return { worktreesRoot: value, ...(auto !== undefined ? { auto } : {}) };
}

/**
 * Absolute folder that receives managed worktrees. The default sits next to the repository;
 * a configured value may be relative (to the repository) or absolute but never inside the
 * working tree or the Git directory.
 */
export function resolveWorktreesRoot(
  home: string,
  gitCommonDir: string,
  configured: string | undefined,
): string {
  const root =
    configured === undefined
      ? join(dirname(home), basename(home) + '-worktrees')
      : resolve(home, configured);
  assertWorktreeTargetOutsideRepository(home, gitCommonDir, root, 'git.worktreesRoot');

  return root;
}

/** Also used for persisted journal targets, so it never consults the current configuration. */
export function assertWorktreeTargetOutsideRepository(
  home: string,
  gitCommonDir: string,
  target: string,
  label = 'Worktree target',
): void {
  if (isInsideOrSame(home, target) || isInsideOrSame(gitCommonDir, target)) {
    throw invalid(label + ' must be outside the repository working tree and the .git directory.');
  }
}

function isInsideOrSame(parent: string, child: string): boolean {
  const fold = (value: string) =>
    process.platform === 'win32' ? resolve(value).toLowerCase() : resolve(value);
  const rel = relative(fold(parent), fold(child));

  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Placeholders: {slug}, {shortId} and {key} (the Specification key, `nevo-12`), each at most once; at
 * least one token is required.
 */
export function validateBranchPattern(pattern: string): void {
  if (!pattern || pattern.length > 200) {
    throw invalid('Invalid Git worktree branch pattern.');
  }

  const tokens = [...pattern.matchAll(/\{([^{}]*)\}/gu)].map((match) => match[1]);
  if (
    tokens.some((token) => !SUPPORTED_TEMPLATE_FIELDS.some((field) => field === token)) ||
    tokens.length === 0 ||
    tokens.filter((token) => token === 'shortId').length > 1 ||
    tokens.filter((token) => token === 'slug').length > 1 ||
    tokens.filter((token) => token === 'key').length > 1
  ) {
    throw invalid(
      'Branch pattern supports at most one {slug}, one {shortId} and one {key}, and needs at least one.',
    );
  }

  // Detect unmatched braces and hidden template expressions.
  const withoutTokens = pattern.replace(/\{(?:slug|shortId|key)\}/gu, '');
  if (/[{}]/u.test(withoutTokens)) {
    throw invalid('Malformed Git branch template.');
  }

  validateBranchName(expandBranchPattern(pattern, 'example', '12345678', 'nevo-1'));
}

/** The pattern with its placeholders replaced. */
export function expandBranchPattern(
  pattern: string,
  slug: string,
  shortId: string,
  key: string,
): string {
  return pattern
    .replaceAll('{slug}', slug)
    .replaceAll('{shortId}', shortId)
    .replaceAll('{key}', key);
}

export function resolveWorktreeBranch(
  policy: GitWorktreePolicy,
  slug: string,
  shortId: string,
  override?: string,
  key?: string,
): string {
  if (
    !/^[a-z0-9][a-z0-9-]*$/u.test(slug) ||
    !/^[a-f0-9]{8}$/iu.test(shortId) ||
    (key !== undefined && !/^[a-z][a-z0-9]*-[1-9][0-9]*$/u.test(key))
  ) {
    throw invalid('Invalid worktree naming token.');
  }

  if (override === undefined && key === undefined && policy.branchPattern.includes('{key}')) {
    throw invalid('The branch pattern names {key}, but the Specification has none.');
  }

  const branch = override ?? expandBranchPattern(policy.branchPattern, slug, shortId, key ?? '');
  validateBranchName(branch);

  return branch;
}

function invalid(message: string): GitCapabilityError {
  return new GitCapabilityError('GIT_POLICY_INVALID', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
