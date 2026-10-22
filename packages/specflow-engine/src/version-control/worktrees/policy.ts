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
}

export const DEFAULT_BRANCH_PATTERN = 'feature/{slug}';
export const DEFAULT_BASE_REF = 'HEAD';

const SUPPORTED_TEMPLATE_FIELDS = ['slug', 'shortId'] as const;

/** Pure parser. Call with Project Home config, never the linked checkout config. */
export function parseGitWorktreePolicy(
  projectConfig: unknown,
  localConfig?: unknown,
): GitWorktreePolicy {
  if (!isRecord(projectConfig)) throw invalid('Project configuration must be an object.');
  const worktreesRoot = parseLocalWorktreesRoot(localConfig);

  const value = projectConfig.git;
  if (value === undefined) {
    return {
      enabled: false,
      branchPattern: DEFAULT_BRANCH_PATTERN,
      baseRef: DEFAULT_BASE_REF,
      commits: { protectedBranches: [] },
      ...(worktreesRoot !== undefined ? { worktreesRoot } : {}),
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
    if (typeof target !== 'string')
      throw invalid('git.integrationTargetBranch must be a local branch.');
    validateBranchName(target);
    if (target === 'HEAD') throw invalid('Integration target must be a named local branch.');
  }
  return {
    enabled: value.enabled,
    branchPattern,
    baseRef,
    ...(target !== undefined ? { integrationTargetBranch: target } : {}),
    commits: parseCommitsPolicy(value.commits),
    ...(worktreesRoot !== undefined ? { worktreesRoot } : {}),
  };
}

/** `git.commits` is validated even while Git is disabled (a typo is found early) but is then inert. */
function parseCommitsPolicy(value: unknown): GitCommitsPolicy {
  if (value === undefined) return { protectedBranches: [] };
  if (!isRecord(value)) throw invalid('git.commits must be an object.');
  if (Object.keys(value).some((key) => key !== 'protectedBranches' && key !== 'allowedBranches')) {
    throw invalid('Unsupported git.commits policy key.');
  }
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
  };
}

function parsePatternList(label: string, value: unknown): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw invalid(label + ' must be a list of branch patterns.');
  if (value.length > BRANCH_PATTERN_MAX_ENTRIES) {
    throw invalid(label + ' has too many entries.');
  }
  const patterns: string[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'string') throw invalid(label + ' entries must be strings.');
    const pattern = entry.trim();
    if (branchPatternProblem(pattern) !== undefined) {
      throw invalid(label + ' contains an invalid branch pattern.');
    }
    // A literal (wildcard-free) entry names one branch and must be a valid branch name.
    if (!/[*?[]/u.test(pattern)) validateBranchName(pattern);
    if (patterns.includes(pattern)) throw invalid(label + ' contains a duplicate pattern.');
    patterns.push(pattern);
  }
  return patterns;
}

/** Only `git.worktreesRoot` may live in the workstation-local config; all other Git policy is committed. */
function parseLocalWorktreesRoot(localConfig: unknown): string | undefined {
  if (!isRecord(localConfig) || localConfig.git === undefined) return undefined;
  const local = localConfig.git;
  if (!isRecord(local) || Object.keys(local).some((key) => key !== 'worktreesRoot')) {
    throw invalid('Only git.worktreesRoot can be set in workstation-local configuration.');
  }
  const value = local.worktreesRoot;
  if (value === undefined) return undefined;
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 1000 ||
    value.includes('\u0000')
  ) {
    throw invalid('git.worktreesRoot must be a non-empty path.');
  }
  return value;
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

/** Two placeholders are supported; {shortId} is optional, but at least one token is required. */
export function validateBranchPattern(pattern: string): void {
  if (!pattern || pattern.length > 200) throw invalid('Invalid Git worktree branch pattern.');
  const tokens = [...pattern.matchAll(/\{([^{}]*)\}/gu)].map((match) => match[1]);
  if (
    tokens.some((token) => !SUPPORTED_TEMPLATE_FIELDS.some((field) => field === token)) ||
    tokens.length === 0 ||
    tokens.filter((token) => token === 'shortId').length > 1 ||
    tokens.filter((token) => token === 'slug').length > 1
  ) {
    throw invalid(
      'Branch pattern supports at most one {slug} and one optional {shortId}, and needs at least one.',
    );
  }
  // Detect unmatched braces and hidden template expressions.
  const withoutTokens = pattern.replace(/\{(?:slug|shortId)\}/gu, '');
  if (/[{}]/u.test(withoutTokens)) throw invalid('Malformed Git branch template.');
  validateBranchName(pattern.replaceAll('{slug}', 'example').replaceAll('{shortId}', '12345678'));
}

export function resolveWorktreeBranch(
  policy: GitWorktreePolicy,
  slug: string,
  shortId: string,
  override?: string,
): string {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(slug) || !/^[a-f0-9]{8}$/iu.test(shortId)) {
    throw invalid('Invalid worktree naming token.');
  }
  const branch =
    override ?? policy.branchPattern.replaceAll('{slug}', slug).replaceAll('{shortId}', shortId);
  validateBranchName(branch);
  return branch;
}

function invalid(message: string): GitCapabilityError {
  return new GitCapabilityError('GIT_POLICY_INVALID', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
