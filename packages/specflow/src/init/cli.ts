import { join, relative, dirname, basename } from 'node:path';

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
import {
  chooseBranchPattern,
  chooseIntegrationTargetBranch,
  chooseProtectedBranches,
  chooseWorktreesRoot,
  integrationTargetProtectedNote,
} from './prompts';

export interface ProjectInitCommandContext {
  readonly cwd: string;
  readonly stdout: (line: string) => void;
  readonly ui?: RuntimeSetupUi;
  readonly resolveLayout?: (cwd: string) => Promise<GitCheckoutLayout>;
  readonly initRuntime?: (options: { ui: RuntimeSetupUi }) => Promise<RuntimeInitContribution>;
  readonly initialize?: (options: InitializeProjectOptions) => Promise<InitializeProjectResult>;
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
