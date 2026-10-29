import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import {
  BRANCH_PATTERN_MAX_ENTRIES,
  BRANCH_PATTERN_MAX_LENGTH,
  branchPatternProblem,
  DEFAULT_BRANCH_PATTERN,
  inspectLocalBranches,
  matchesBranchPattern,
  parseCommitsPolicy,
  resolveWorktreesRoot,
  validateBranchPattern,
  type BranchPatternProblem,
} from '@nevo/specflow-engine';
import type { RuntimeSetupUi } from '@nevo/specflow-runtime';

/**
 * The interactive questions of `init` for the Git section. Every free-text answer is validated by
 * the Engine's own validators, so init can never write a value the Engine would later reject. The
 * command wiring (what is asked in which order and what is written) lives in `cli.ts`.
 */

/**
 * The target must be an existing local branch, so offer the existing ones instead of free
 * text. A repository without commits has no branches yet: say how to fix that.
 */
export async function chooseIntegrationTargetBranch(
  ui: RuntimeSetupUi,
  root: string,
): Promise<string> {
  const { branches, current } = await inspectLocalBranches(root);
  if (branches.length === 0) {
    const unborn = current;
    throw new Error(
      'This repository has no local branches yet' +
        (unborn ? ` (HEAD points at the unborn branch '${unborn}')` : '') +
        '. Create the first commit (git add -A && git commit -m "Initial commit"), then run init again.',
    );
  }
  const selected = await ui.select(
    'Branch receiving integrated worktrees',
    branches.map((name) => ({
      value: name,
      label: name,
      ...(name === current ? { hint: 'current' } : {}),
    })),
    current !== undefined && branches.includes(current) ? current : branches[0],
  );
  return selected;
}

/** `~` and `~/x` mean the home folder in what a person types; the config stores the real path. */
export function expandHomeFolder(text: string, home: string = homedir()): string {
  if (text === '~') return home;
  return text.startsWith('~/') || text.startsWith('~\\') ? join(home, text.slice(2)) : text;
}

const CUSTOM_PATTERN = '__custom__';
const MAX_PATTERN_ATTEMPTS = 3;

/**
 * Branch pattern for managed worktrees. Presets cover the common shapes; a custom text
 * is validated by the Engine's own pattern validator so init can never write a pattern
 * the Runtime would later reject.
 */
export async function chooseBranchPattern(ui: RuntimeSetupUi): Promise<string> {
  const selected = await ui.select<string>(
    'Branch name pattern for new worktrees',
    [
      { value: DEFAULT_BRANCH_PATTERN, label: DEFAULT_BRANCH_PATTERN, hint: 'recommended' },
      { value: 'feature/{slug}-{shortId}', label: 'feature/{slug}-{shortId}' },
      { value: 'spec/{slug}-{shortId}', label: 'spec/{slug}-{shortId}' },
      { value: CUSTOM_PATTERN, label: 'Custom pattern...' },
    ],
    DEFAULT_BRANCH_PATTERN,
  );
  if (selected !== CUSTOM_PATTERN) return selected;
  for (let attempt = 1; attempt <= MAX_PATTERN_ATTEMPTS; attempt += 1) {
    const text = (
      await ui.input(
        'Custom branch pattern ({slug}, {key} and optional {shortId})',
        DEFAULT_BRANCH_PATTERN,
      )
    ).trim();
    try {
      validateBranchPattern(text);
      return text;
    } catch (error) {
      ui.note(
        error instanceof Error ? error.message : 'Invalid branch pattern.',
        'Invalid pattern',
      );
    }
  }
  throw new Error('No valid branch pattern was provided.');
}

/**
 * Machine-local folder that receives managed worktrees. Returns the value to store in the local
 * config, or `undefined` when the default (`<repo>-worktrees` next to the repository) is kept.
 * Relative values resolve against the repository; the Engine validator rejects anything inside
 * the working tree or `.git`.
 */
export async function chooseWorktreesRoot(
  ui: RuntimeSetupUi,
  root: string,
): Promise<string | undefined> {
  const defaultRoot = join(dirname(root), basename(root) + '-worktrees');
  for (let attempt = 1; attempt <= MAX_PATTERN_ATTEMPTS; attempt += 1) {
    const text = expandHomeFolder(
      (await ui.input('Folder for new worktrees (this machine only)', defaultRoot)).trim(),
    );
    if (!text || text === defaultRoot) return undefined;
    try {
      resolveWorktreesRoot(root, join(root, '.git'), text);
      return text;
    } catch (error) {
      ui.note(error instanceof Error ? error.message : 'Invalid folder.', 'Invalid folder');
    }
  }
  throw new Error('No valid worktree folder was provided.');
}

/** Branches offered as protected when they exist locally (the usual long-lived ones). */
const SUGGESTED_PROTECTED_BRANCHES = ['main', 'master'] as const;

const PATTERN_PROBLEMS: Record<BranchPatternProblem, string> = {
  empty: 'Enter a branch name or pattern.',
  'too-long': `The pattern is too long (at most ${BRANCH_PATTERN_MAX_LENGTH} characters).`,
  characters:
    'The pattern contains characters that are not allowed. Use letters, digits, ".", "-", "_", "/" and the wildcards "*", "**", "?" and "[a-z]".',
  structure:
    'The pattern has a layout that is not allowed: do not start or end with "/", do not use "..", "//", a "refs/" prefix or a ".lock" suffix, and close every "[" set.',
};

/** Why a protected-branch pattern is not accepted, or `undefined` when it is (Engine rule). */
export function protectedBranchPatternProblem(pattern: string): string | undefined {
  const problem = branchPatternProblem(pattern);
  if (problem) return PATTERN_PROBLEMS[problem];
  // The Engine's own `git.commits` validator is the single source of truth (it also applies the
  // branch-name rule to wildcard-free entries, which the pattern grammar alone does not).
  try {
    parseCommitsPolicy({ protectedBranches: [pattern] });
    return undefined;
  } catch {
    return 'A wildcard-free entry must be a valid branch name: start with a letter or digit, no leading "-", no segment starting with ".", no trailing ".".';
  }
}

/**
 * Branches on which the Nevo Engine never commits specification files (`git.commits.protectedBranches`).
 * Step one asks about each of `main` and `master` that exists locally (kept by default), step two
 * collects any number of custom patterns in the GitHub branch-protection style (`*` does not cross
 * "/", `**` does, `?`, `[a-z]`), each checked by the Engine's own pattern validator so init can
 * never write a pattern the Engine would later reject. Nothing selected means nothing is protected.
 */
export async function chooseProtectedBranches(ui: RuntimeSetupUi, root: string): Promise<string[]> {
  const protectedBranches: string[] = [];
  const add = (pattern: string): boolean => {
    if (protectedBranches.includes(pattern)) return false;
    protectedBranches.push(pattern);
    return true;
  };

  const { branches: local } = await inspectLocalBranches(root);
  for (const name of SUGGESTED_PROTECTED_BRANCHES.filter((suggested) =>
    local.includes(suggested),
  )) {
    if (
      await ui.confirm(
        `Protect branch '${name}'? Nevo will not commit specifications on it (use a new worktree instead).`,
        true,
      )
    ) {
      add(name);
    }
  }

  while (
    protectedBranches.length < BRANCH_PATTERN_MAX_ENTRIES &&
    (await ui.confirm(
      protectedBranches.length === 0
        ? 'Protect other branches? (nothing is protected yet; patterns such as release/** are allowed)'
        : 'Protect another branch or pattern? (for example release/**)',
      false,
    ))
  ) {
    const pattern = (
      await ui.input('Branch name or pattern (* stays within a "/" segment, ** crosses it)')
    ).trim();
    const problem = protectedBranchPatternProblem(pattern);
    if (problem) {
      ui.note(problem, 'Invalid pattern');
    } else if (!add(pattern)) {
      ui.note(`'${pattern}' is already protected.`, 'Already listed');
    }
  }
  return protectedBranches;
}

/** Quiet explanation when the integration target is itself protected (allowed, but good to know). */
export function integrationTargetProtectedNote(
  integrationTargetBranch: string,
  protectedBranches: readonly string[],
): string | undefined {
  return protectedBranches.some((pattern) => matchesBranchPattern(pattern, integrationTargetBranch))
    ? `The integration branch '${integrationTargetBranch}' is protected: Nevo cannot commit specifications directly on it, so specifications are created in a new or existing worktree. Merging worktrees into it is not affected.`
    : undefined;
}

/**
 * Whether the Engine commits document edits by itself (`git.commits.auto.documents`). The answer
 * defaults to "no": automatic commit is off unless the configuration enables it, so declining, an
 * unanswered prompt and a non-interactive run all write nothing.
 */
export async function chooseAutoCommit(ui: RuntimeSetupUi): Promise<boolean> {
  const answer = await ui.select<'no' | 'yes'>(
    'Commit documents automatically?',
    [
      {
        value: 'no',
        label: 'No (default)',
        hint: 'Edits stay uncommitted until "nevo-specflow commit"',
      },
      { value: 'yes', label: 'Yes', hint: 'The Engine commits document edits by itself' },
    ],
    'no',
  );
  return answer === 'yes';
}
