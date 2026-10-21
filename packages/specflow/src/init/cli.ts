import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { relative } from 'node:path';

import {
  bootstrapProjectHome,
  assertPrimaryGitCheckout,
  resolveGitCheckoutLayout,
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
      let gitConfig: { enabled: boolean; integrationTargetBranch?: string } = { enabled: false };
      if (gitEnabled) {
        const integrationTargetBranch = await chooseIntegrationTargetBranch(ui, layout.root);
        gitConfig = { enabled: true, integrationTargetBranch };
      }
      const contribution = {
        projectConfig: { runtime: runtime.projectConfig, git: gitConfig },
        localConfig: { runtime: runtime.localConfig },
      };

      ui.note(
        [
          ...runtime.summary,
          'Git worktrees: ' + (gitConfig.enabled ? 'enabled' : 'disabled'),
          ...(gitConfig.integrationTargetBranch
            ? ['Integration branch: ' + gitConfig.integrationTargetBranch]
            : []),
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
