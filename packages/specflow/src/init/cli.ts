import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { homedir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';

import {
  bootstrapProjectHome,
  assertPrimaryGitCheckout,
  BRANCH_PATTERN_MAX_ENTRIES,
  BRANCH_PATTERN_MAX_LENGTH,
  branchPatternProblem,
  DEFAULT_BRANCH_PATTERN,
  matchesBranchPattern,
  resolveWorktreesRoot,
  validateBranchPattern,
  resolveGitCheckoutLayout,
  type BranchPatternProblem,
  type GitCheckoutLayout,
} from '@nevo/specflow-engine';
import {
  initRuntime,
  type RuntimeInitContribution,
  type RuntimeSetupUi,
} from '@nevo/specflow-runtime';
import { Command } from 'commander';

import {
  assertProjectCanInitialize,
  initializeProject,
  type InitializeProjectOptions,
  type InitializeProjectResult,
} from './initialize-project';

const gitProcess = promisify(execFile);

export interface ProjectInitCommandContext {
  readonly cwd: string;
  readonly stdout: (line: string) => void;
  readonly ui?: RuntimeSetupUi;
  readonly resolveLayout?: (cwd: string) => Promise<GitCheckoutLayout>;
  readonly initRuntime?: (options: { ui: RuntimeSetupUi }) => Promise<RuntimeInitContribution>;
  readonly initialize?: (options: InitializeProjectOptions) => Promise<InitializeProjectResult>;
}

/** Local branch names (refs/heads), empty for a repository without commits. */
async function listLocalBranches(root: string): Promise<string[]> {
  try {
    const { stdout } = await gitProcess(
      'git',
      ['for-each-ref', '--format=%(refname:short)', 'refs/heads'],
      { cwd: root },
    );
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function currentBranchName(root: string): Promise<string | undefined> {
  try {
    const { stdout } = await gitProcess('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
      cwd: root,
    });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The target must be an existing local branch, so offer the existing ones instead of free
 * text. A repository without commits has no branches yet: say how to fix that.
 */
export async function chooseIntegrationTargetBranch(
  ui: RuntimeSetupUi,
  root: string,
): Promise<string> {
  const branches = await listLocalBranches(root);
  if (branches.length === 0) {
    const unborn = await currentBranchName(root);
    throw new Error(
      'This repository has no local branches yet' +
        (unborn ? ` (HEAD points at the unborn branch '${unborn}')` : '') +
        '. Create the first commit (git add -A && git commit -m "Initial commit"), then run init again.',
    );
  }
  const current = await currentBranchName(root);
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
        'Custom branch pattern ({slug} and optional {shortId})',
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
  return problem ? PATTERN_PROBLEMS[problem] : undefined;
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

  const local = await listLocalBranches(root);
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

export function createProjectInitCommand(context: ProjectInitCommandContext): Command {
  return new Command('init')
    .description('Initialize Nevo SpecFlow configuration for this repository')
    .action(async () => {
      const ui = context.ui;
      if (!ui) {
        throw new Error('Interactive project initialization is not available in this CLI context.');
      }

      const layout = await (context.resolveLayout ?? resolveGitCheckoutLayout)(context.cwd);
      // Reject linked worktrees before asking questions or mutating configuration.
      await assertPrimaryGitCheckout(layout.root);
      await assertProjectCanInitialize(layout);

      const runtime = await (context.initRuntime ?? initRuntime)({ ui });
      const gitEnabled = await ui.confirm(
        'Enable managed Git worktrees and lifecycle operations?',
        true,
      );
      let worktreesRoot: string | undefined;
      let gitConfig: {
        enabled: boolean;
        integrationTargetBranch?: string;
        worktrees?: { branchPattern: string };
        commits?: { protectedBranches: string[] };
      } = { enabled: false };
      let protectedBranches: string[] = [];
      if (gitEnabled) {
        const integrationTargetBranch = await chooseIntegrationTargetBranch(ui, layout.root);
        const branchPattern = await chooseBranchPattern(ui);
        gitConfig = { enabled: true, integrationTargetBranch, worktrees: { branchPattern } };
        worktreesRoot = await chooseWorktreesRoot(ui, layout.root);
        protectedBranches = await chooseProtectedBranches(ui, layout.root);
        if (protectedBranches.length > 0) {
          gitConfig = { ...gitConfig, commits: { protectedBranches } };
        }
      }
      const protectedNote =
        gitConfig.integrationTargetBranch !== undefined
          ? integrationTargetProtectedNote(gitConfig.integrationTargetBranch, protectedBranches)
          : undefined;
      const contribution = {
        projectConfig: { runtime: runtime.projectConfig, git: gitConfig },
        localConfig: {
          runtime: runtime.localConfig,
          ...(worktreesRoot !== undefined ? { git: { worktreesRoot } } : {}),
        },
      };

      ui.note(
        [
          ...runtime.summary,
          'Git worktrees: ' + (gitConfig.enabled ? 'enabled' : 'disabled'),
          ...(gitConfig.integrationTargetBranch
            ? ['Integration branch: ' + gitConfig.integrationTargetBranch]
            : []),
          ...(gitConfig.worktrees ? ['Branch pattern: ' + gitConfig.worktrees.branchPattern] : []),
          ...(gitConfig.enabled
            ? [
                'Worktree folder: ' +
                  (worktreesRoot ??
                    join(dirname(layout.root), basename(layout.root) + '-worktrees')),
                'Protected branches: ' +
                  (protectedBranches.length > 0 ? protectedBranches.join(', ') : 'none'),
              ]
            : []),
          ...(protectedNote ? ['', protectedNote] : []),
          '',
          `Project config: ${relative(layout.root, layout.projectConfigPath)}`,
          `Local config: ${relative(layout.root, layout.localConfigPath)}`,
          '',
          'You can change these settings later.',
        ].join('\n'),
        'Review',
      );

      if (!(await ui.confirm('Write configuration?', true))) {
        ui.note('No files were written.', 'Setup cancelled');
        return;
      }

      const result = await (context.initialize ?? initializeProject)({
        layout,
        contribution,
      });

      // Config is published before home designation. On failure, keep any
      // persisted marker/registry for explicit recovery; never reset identity.
      await bootstrapProjectHome(result.root);

      context.stdout('Initialized Nevo SpecFlow.');
      context.stdout(`Project config: ${relative(result.root, result.projectConfigPath)}`);
      context.stdout(`Local config: ${relative(result.root, result.localConfigPath)}`);
    });
}
