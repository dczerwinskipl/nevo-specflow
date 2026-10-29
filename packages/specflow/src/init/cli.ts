import { join, relative, dirname, basename } from 'node:path';

import {
  GitCapabilityError,
  assertInitialDefinitionsCommittable,
  bootstrapProjectHome,
  assertPrimaryGitCheckout,
  commitInstalledDefinitions,
  findOrphanedGitInstance,
  initialDefinitionsBranchOffer,
  inspectLocalBranches,
  resolveGitCheckoutLayout,
  startInitialDefinitionsBranch,
  type GitCheckoutLayout,
} from '@nevo/specflow-engine';
import {
  initRuntime,
  type RuntimeInitContribution,
  type RuntimeSetupUi,
} from '@nevo/specflow-runtime';
import { Command } from 'commander';

import { definitionsBranchRefusalLines } from '../definitions/branch-refusal';
import { claimedGitInstanceLines } from '../project/claimed-instance';
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

/** The Git section init collects and writes to the project configuration. */
interface InitGitConfig {
  enabled: boolean;
  integrationTargetBranch?: string;
  worktrees?: { branchPattern: string };
  commits?: { protectedBranches: string[] };
}

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
      // A repository an earlier project claimed cannot be designated again: say so before anything is
      // asked or written, instead of failing after the configuration is in place.
      const claimed = await findOrphanedGitInstance(layout.root);
      if (claimed !== undefined) {
        throw new Error(
          [
            'Nevo SpecFlow cannot initialize this repository.',
            ...claimedGitInstanceLines(claimed, 'nevo-specflow init'),
          ].join('\n'),
        );
      }

      const runtime = await (context.initRuntime ?? initRuntime)({ ui });
      const gitEnabled = await ui.confirm(
        'Enable managed Git worktrees and lifecycle operations?',
        true,
      );
      let worktreesRoot: string | undefined;
      let gitConfig: InitGitConfig = { enabled: false };
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
      // The definitions are written only where Nevo may commit them, so they are never left untracked
      // in the worktree. On a protected (or not allowed) branch init offers a new branch for them;
      // otherwise it says so and goes on without them.
      let installDefinitions = options.definitions;
      let definitionsNote: string | undefined;
      let definitionsBranch: string | undefined;
      if (installDefinitions) {
        const refusal = await definitionsRefusalForInit(layout.root, gitConfig);
        if (refusal !== undefined) {
          definitionsBranch = await chooseDefinitionsBranch(ui, layout.root, gitConfig, refusal);
          if (definitionsBranch === undefined) {
            installDefinitions = false;
            definitionsNote = refusal.note;
          }
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
              ? definitionsBranch !== undefined
                ? `install and commit them on the new branch '${definitionsBranch}' (init switches to it)`
                : gitConfig.enabled
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

      // Before anything is written: a new branch at the current commit, so the definitions are committed
      // there and the protected branch is never committed on. The working tree is left as it is.
      let previousBranch: string | undefined;
      if (definitionsBranch !== undefined) {
        previousBranch = (await inspectLocalBranches(layout.root)).current;
        definitionsBranch = await startInitialDefinitionsBranch(layout.root, gitConfig);
        context.stdout(`Switched to the new branch '${definitionsBranch}'.`);
      }

      let result: InitializeProjectResult;
      try {
        result = await (context.initialize ?? initializeProject)({
          layout,
          contribution,
          installDefinitions,
        });
      } catch (error) {
        if (definitionsBranch === undefined || previousBranch === undefined) throw error;
        // Nothing was written (initialization undoes its files), but the checkout moved.
        throw new Error(
          (error instanceof Error ? error.message : String(error)) +
            `\nInit had switched to the new branch '${definitionsBranch}'; switch back with: git switch ${previousBranch}`,
          { cause: error },
        );
      }

      // Config is published before home designation. On failure, keep any
      // persisted marker/registry for explicit recovery; never reset identity.
      let engine;
      try {
        engine = await bootstrapProjectHome(result.root);
      } catch (error) {
        throw await bootstrapFailure(result.root, error, {
          definitionsWritten: (result.definitionPaths ?? []).length > 0,
        });
      }

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
          if (definitionsBranch !== undefined) {
            const target =
              previousBranch !== undefined ? `'${previousBranch}'` : 'your main branch';
            context.stdout(
              `The definitions are on the branch '${definitionsBranch}', which is checked out now. ` +
                `Merge it into ${target} (for example through a pull request) so that every checkout has them.`,
            );
          }
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

interface DefinitionsRefusal {
  /** The review line: why they are not installed and how to install them later. */
  readonly note: string;
  /** `branch-protected`, `branch-not-allowed`, `detached`, `no-commits`. */
  readonly reason?: string;
}

/**
 * Why the default definitions cannot be installed (and committed) right now: a protected or not-allowed
 * branch, a detached HEAD or a repository without commits. `undefined` when they can.
 */
async function definitionsRefusalForInit(
  root: string,
  git: InitGitConfig,
): Promise<DefinitionsRefusal | undefined> {
  try {
    await assertInitialDefinitionsCommittable(root, git);
    return undefined;
  } catch (error) {
    if (!(error instanceof GitCapabilityError)) throw error;
    if (error.code === 'BRANCH_PROTECTED') {
      const { current } = await inspectLocalBranches(root);
      return {
        note: [
          'not installed. Create needs them: until they are installed the archetype catalogue is empty.',
          ...definitionsBranchRefusalLines(current, error.reason),
        ].join('\n'),
        ...(error.reason !== undefined ? { reason: error.reason } : {}),
      };
    }
    return {
      note:
        'not installed: Nevo cannot commit them on the current branch' +
        (error.reason ? ` (${error.reason})` : '') +
        '. Run "nevo-specflow definitions install" on a branch Nevo may commit on.',
      ...(error.reason !== undefined ? { reason: error.reason } : {}),
    };
  }
}

/**
 * On a protected or not-allowed branch: offer to put the definitions on a new branch (created at the
 * current commit, which init switches to) or to go on without them. Never offered when the policy
 * would refuse the new branch too or the name is taken. Returns the branch to create, or `undefined`.
 */
async function chooseDefinitionsBranch(
  ui: RuntimeSetupUi,
  root: string,
  git: InitGitConfig,
  refusal: DefinitionsRefusal,
): Promise<string | undefined> {
  if (refusal.reason !== 'branch-protected' && refusal.reason !== 'branch-not-allowed') {
    return undefined;
  }
  const offer = await initialDefinitionsBranchOffer(root, git);
  if (offer === undefined) return undefined;
  const { current } = await inspectLocalBranches(root);
  ui.note(refusal.note.replace(/^not installed\. /u, ''), 'Default definitions');
  const choice = await ui.select<'branch' | 'skip'>(
    'Where should init put the default definitions?',
    [
      {
        value: 'branch',
        label: `On a new branch '${offer}'`,
        hint: `init creates it from '${current ?? 'HEAD'}', switches to it and commits them there; merge it afterwards`,
      },
      {
        value: 'skip',
        label: 'Nowhere for now',
        hint: 'install them later with "nevo-specflow definitions install" on a branch Nevo may commit on',
      },
    ],
    'branch',
  );
  return choice === 'branch' ? offer : undefined;
}

/**
 * The configuration is written before the Project Home is designated, so a failed designation leaves
 * a configured repository that `init` refuses to touch again. The error says how to finish, and, when
 * the Git instance evidence of an earlier project is the cause, names that file and what it means.
 * Nothing is removed or reset here: the recovery stays the person's explicit step.
 */
async function bootstrapFailure(
  root: string,
  error: unknown,
  written: { readonly definitionsWritten: boolean },
): Promise<Error> {
  const claimed = await findOrphanedGitInstance(root).catch(() => undefined);
  const lines = [
    'Nevo SpecFlow wrote its configuration (.nevo/config.yaml, .nevo/local/config.yaml)' +
      (written.definitionsWritten ? ' and the default definitions (not committed)' : '') +
      ' but could not designate this checkout as its Project Home: ' +
      (error instanceof Error ? error.message : String(error)),
    ...(claimed !== undefined
      ? claimedGitInstanceLines(claimed, 'nevo-specflow project bootstrap')
      : []),
    'Init does not run again on a configured repository. Fix the cause, then finish with: nevo-specflow project bootstrap',
    ...(written.definitionsWritten
      ? ['Then commit the definitions with: nevo-specflow definitions install --add-missing']
      : []),
  ];
  return new Error(lines.join('\n'), { cause: error });
}
