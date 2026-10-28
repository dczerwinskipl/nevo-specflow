import { join, relative, dirname, basename } from 'node:path';

import {
  GitCapabilityError,
  assertInitialDefinitionsCommittable,
  bootstrapProjectHome,
  assertPrimaryGitCheckout,
  commitInstalledDefinitions,
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
  chooseAutoCommit,
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
    .option(
      '--no-definitions',
      'Do not install the default definitions (install them later with "definitions install")',
    )
    .action(async (options: { definitions: boolean }) => {
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
      let autoCommit = false;
      if (gitEnabled) {
        const integrationTargetBranch = await chooseIntegrationTargetBranch(ui, layout.root);
        const branchPattern = await chooseBranchPattern(ui);
        gitConfig = { enabled: true, integrationTargetBranch, worktrees: { branchPattern } };
        worktreesRoot = await chooseWorktreesRoot(ui, layout.root);
        protectedBranches = await chooseProtectedBranches(ui, layout.root);
        if (protectedBranches.length > 0) {
          gitConfig = { ...gitConfig, commits: { protectedBranches } };
        }
        autoCommit = await chooseAutoCommit(ui);
      }
      // The definitions are written only where Nevo may commit them; otherwise init says so and goes on
      // without them, so it never leaves them untracked in the worktree.
      let installDefinitions = options.definitions;
      let definitionsNote: string | undefined;
      if (installDefinitions) {
        definitionsNote = await definitionsRefusalForInit(layout.root, gitConfig);
        if (definitionsNote !== undefined) installDefinitions = false;
      }
      const protectedNote =
        gitConfig.integrationTargetBranch !== undefined
          ? integrationTargetProtectedNote(gitConfig.integrationTargetBranch, protectedBranches)
          : undefined;
      const contribution = {
        projectConfig: { runtime: runtime.projectConfig, git: gitConfig },
        localConfig: {
          runtime: runtime.localConfig,
          // Opting in is a personal workflow choice: it goes to the workstation-local config (which
          // wins over the committed one); a team can commit the same key in the project config.
          // Declining writes nothing: an unset key is off.
          ...(worktreesRoot !== undefined || autoCommit
            ? {
                git: {
                  ...(worktreesRoot !== undefined ? { worktreesRoot } : {}),
                  ...(autoCommit ? { commits: { auto: { documents: true } } } : {}),
                },
              }
            : {}),
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
                'Automatic commit of documents: ' + (autoCommit ? 'on (local config)' : 'off'),
              ]
            : []),
          ...(protectedNote ? ['', protectedNote] : []),
          'Default definitions: ' +
            (installDefinitions
              ? gitConfig.enabled
                ? 'install and commit them'
                : 'install them'
              : (definitionsNote ?? 'not installed (--no-definitions)')),
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
        installDefinitions,
      });

      // Config is published before home designation. On failure, keep any
      // persisted marker/registry for explicit recovery; never reset identity.
      const engine = await bootstrapProjectHome(result.root);

      context.stdout('Initialized Nevo SpecFlow.');
      context.stdout(`Project config: ${relative(result.root, result.projectConfigPath)}`);
      context.stdout(`Local config: ${relative(result.root, result.localConfigPath)}`);
      if (result.definitionPaths && result.definitionPaths.length > 0) {
        context.stdout(
          `Default definitions: ${result.definitionPaths.length} files in .nevo/definitions`,
        );
        try {
          const commit = await commitInstalledDefinitions(engine, result.definitionPaths);
          if (commit) context.stdout(`Committed the definitions as ${commit.sha.slice(0, 7)}.`);
        } catch (error) {
          // The configuration is in place (it is the success marker), so init cannot be run again.
          throw new Error(
            'The default definitions were written but not committed' +
              (error instanceof Error ? ` (${error.message})` : '') +
              '. Run "nevo-specflow definitions install --add-missing" to commit them.',
            { cause: error },
          );
        }
      }
    });
}

/**
 * Why the default definitions cannot be installed (and committed) right now: a protected or not-allowed
 * branch, a detached HEAD or a repository without commits. `undefined` when they can.
 */
async function definitionsRefusalForInit(
  root: string,
  git: { enabled: boolean; commits?: { protectedBranches: string[] } },
): Promise<string | undefined> {
  try {
    await assertInitialDefinitionsCommittable(root, git);
    return undefined;
  } catch (error) {
    if (error instanceof GitCapabilityError) {
      return (
        'not installed: Nevo cannot commit them on the current branch' +
        (error.reason ? ` (${error.reason})` : '') +
        '. Run "nevo-specflow definitions install" on a branch Nevo may commit on.'
      );
    }
    throw error;
  }
}
