import { resolve } from 'node:path';

import {
  GitCapabilityError,
  inspectLocalBranches,
  installProjectDefinitions,
  listProjectDefinitions,
  openSpecFlowEngine,
  showProjectDefinition,
  validateDefinitionsFolder,
  validateProjectDefinitions,
  type DefinitionsReport,
  type InstallProjectResult,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';
import { Command, InvalidArgumentError } from 'commander';

import { definitionsBranchRefusalLines } from './branch-refusal';

export interface DefinitionsCommandContext {
  readonly cwd: string;
  readonly stdout: (line: string) => void;
}

/**
 * `nevo-specflow definitions list|show|validate|install`: thin adapters over the Engine. Every
 * command works on the definitions of the Project Home (also when run from a linked checkout, which
 * has no definitions of its own) and prints that home, so the operator sees which folder was used.
 *
 * Exit codes: 0 success; 1 an operation failure, a refused install, or `validate` finding an error;
 * 2 a usage error (an unknown option, a malformed `<kind>/<id>`).
 */
export function createDefinitionsCommand(context: DefinitionsCommandContext): Command {
  const definitions = new Command('definitions').description(
    'List, inspect, validate and install the definitions of this project',
  );

  const emit = (json: boolean | undefined, value: unknown, lines: readonly string[]): void => {
    if (json) context.stdout(JSON.stringify(value));
    else for (const line of lines) context.stdout(line);
  };

  definitions
    .command('list')
    .description('List the definitions of the project and the problems of the rest')
    .option('--kind <kind>', 'Only this kind (document-type, specification-archetype)')
    .option('--project-root <path>', 'Require this verified Project Home root')
    .option('--json', 'Print the result as JSON')
    .action(async (options: { kind?: string; projectRoot?: string; json?: boolean }) => {
      const engine = await engineAt(context.cwd, options.projectRoot);
      const listing = await listProjectDefinitions(engine, {
        ...(options.kind !== undefined ? { kind: options.kind } : {}),
      });
      const projectHome = engine.context.project.homeRoot;
      emit(options.json, { projectHome, ...listing }, [
        `Project Home: ${projectHome}`,
        ...(listing.rootPresent
          ? listing.definitions.map(
              (item) =>
                `${item.kind}/${item.id}${item.version !== undefined ? ` v${item.version}` : ''}${
                  item.title !== undefined ? ` - ${item.title}` : ''
                }`,
            )
          : ['No definitions folder (run "nevo-specflow definitions install").']),
        ...listing.invalid.map((id) => `${id} - INVALID`),
        ...problemLines(listing.problems, listing.problemsTruncated),
      ]);
    });

  definitions
    .command('show')
    .description('Show one definition, or why its file is rejected')
    .argument('<definition>', '<kind>/<id>, for example specification-archetype/feature')
    .option('--project-root <path>', 'Require this verified Project Home root')
    .option('--json', 'Print the result as JSON')
    .action(async (target: string, options: { projectRoot?: string; json?: boolean }) => {
      assertTargetForm(target);
      const engine = await engineAt(context.cwd, options.projectRoot);
      const shown = await showProjectDefinition(engine, target);
      const projectHome = engine.context.project.homeRoot;
      if (shown.state === 'valid') {
        emit(options.json, { projectHome, ...shown }, [
          `Project Home: ${projectHome}`,
          JSON.stringify(shown.entity, null, 2),
        ]);
        return;
      }
      emit(
        options.json,
        { projectHome, ...shown },
        shown.state === 'invalid'
          ? [`Project Home: ${projectHome}`, ...problemLines(shown.problems, false)]
          : [`Project Home: ${projectHome}`],
      );
      throw new Error(
        shown.state === 'invalid'
          ? `${target} is rejected (see the problems above).`
          : `${target} is not defined in this project.`,
      );
    });

  definitions
    .command('validate')
    .description('Validate the definitions of the project, or the given definitions folders')
    .argument('[folder...]', 'Definitions folders to validate instead of the project')
    .option('--project-root <path>', 'Require this verified Project Home root')
    .option('--json', 'Print the result as JSON')
    .action(async (folders: string[], options: { projectRoot?: string; json?: boolean }) => {
      const reports: { readonly path?: string; readonly report: DefinitionsReport }[] = [];
      let projectHome: string | undefined;
      if (folders.length === 0) {
        const engine = await engineAt(context.cwd, options.projectRoot);
        projectHome = engine.context.project.homeRoot;
        reports.push({ report: await validateProjectDefinitions(engine) });
      } else {
        for (const folder of folders) {
          const path = resolve(context.cwd, folder);
          reports.push({ path, report: await validateDefinitionsFolder(path) });
        }
      }
      const lines = [
        ...(projectHome !== undefined ? [`Project Home: ${projectHome}`] : []),
        ...reports.flatMap(({ path, report }) => [
          ...(path !== undefined ? [path] : []),
          ...(report.problems.length === 0 && !report.hasErrors
            ? [report.rootPresent || path !== undefined ? 'OK' : 'No definitions folder.']
            : problemLines(report.problems, report.problemsTruncated)),
        ]),
      ];
      emit(
        options.json,
        {
          ...(projectHome !== undefined ? { projectHome } : {}),
          reports: reports.map(({ path, report }) => ({ ...(path ? { path } : {}), ...report })),
        },
        lines,
      );
      if (reports.some(({ report }) => report.hasErrors)) {
        throw new Error('The definitions have errors.');
      }
    });

  definitions
    .command('install')
    .description('Copy the shipped default definitions into the project')
    .argument('[definition...]', '<kind>/<id> to add (bare install works on a project with none)')
    .option('--add-missing', 'Add every shipped definition the project does not have')
    .option('--force', 'Overwrite files that differ from the shipped ones')
    .option('--dry-run', 'Show what would be written and change nothing')
    .option('--project-root <path>', 'Require this verified Project Home root')
    .option('--json', 'Print the result as JSON')
    .action(
      async (
        targets: string[],
        options: {
          addMissing?: boolean;
          force?: boolean;
          dryRun?: boolean;
          projectRoot?: string;
          json?: boolean;
        },
      ) => {
        for (const target of targets) assertTargetForm(target);
        if (targets.length > 0 && options.addMissing) {
          throw new InvalidArgumentError('Name definitions or use --add-missing, not both.');
        }
        const engine = await engineAt(context.cwd, options.projectRoot);
        let result: InstallProjectResult;
        try {
          result = await installProjectDefinitions(engine, {
            targets,
            ...(options.addMissing ? { addMissing: true } : {}),
            ...(options.force ? { force: true } : {}),
            ...(options.dryRun ? { dryRun: true } : {}),
          });
        } catch (error) {
          // Refused before anything is written: say which branch and how to go on.
          if (error instanceof GitCapabilityError && error.code === 'BRANCH_PROTECTED') {
            const { current } = await inspectLocalBranches(engine.context.project.homeRoot);
            const lines = [
              ...definitionsBranchRefusalLines(current, error.reason),
              'Nothing was written.',
            ];
            // Same code and reason (scripts read them), a message that names the way out.
            throw new GitCapabilityError('BRANCH_PROTECTED', lines.join('\n'), error.reason);
          }
          throw error;
        }
        const projectHome = engine.context.project.homeRoot;
        report(context, options, projectHome, result);
        if (result.outcome.status === 'refused') throw new Error(result.outcome.hint);
      },
    );

  return definitions;
}

function report(
  context: DefinitionsCommandContext,
  options: { dryRun?: boolean; json?: boolean },
  projectHome: string,
  result: InstallProjectResult,
): void {
  const { outcome } = result;
  if (options.json) {
    context.stdout(
      JSON.stringify({
        projectHome,
        dryRun: options.dryRun === true,
        outcome,
        written: result.written,
        ...(result.commit ? { commit: result.commit } : {}),
      }),
    );
    return;
  }
  context.stdout(`Project Home: ${projectHome}`);
  if (outcome.status === 'refused') {
    context.stdout(outcome.hint);
    if (outcome.reason === 'definitions-exist') {
      for (const key of outcome.missing) context.stdout(`  missing: ${key}`);
    } else {
      for (const path of outcome.paths) context.stdout(`  blocked: ${path === '' ? '.' : path}`);
    }
    return;
  }
  if (options.dryRun) {
    context.stdout('Dry run: nothing was written.');
    for (const item of outcome.plan.items) context.stdout(`  ${item.action} ${item.path}`);
    return;
  }
  context.stdout(
    result.written.length === 0
      ? 'Nothing to install: the project has these definitions already.'
      : `Installed ${result.written.length} files.`,
  );
  for (const path of result.written) context.stdout(`  ${path}`);
  for (const item of outcome.plan.items.filter((entry) => entry.action === 'skipped-edited')) {
    context.stdout(`  kept (edited): ${item.path} (use --force to overwrite)`);
  }
  if (result.commit) {
    context.stdout(
      `Committed ${result.commit.paths.length} files as ${result.commit.sha.slice(0, 7)}.`,
    );
  }
}

function problemLines(problems: readonly DefinitionProblem[], truncated: boolean): string[] {
  return [
    ...problems.map(
      (problem) =>
        `${problem.severity}: ${problem.source === '' ? '.' : problem.source}${
          problem.location ? ` ${problem.location}` : ''
        } [${problem.code}] ${problem.message}`,
    ),
    ...(truncated ? ['(more problems exist than are shown)'] : []),
  ];
}

type DefinitionProblem = DefinitionsReport['problems'][number];

const TARGET_FORM = /^[a-z][a-z0-9-]{0,31}\/[a-z][a-z0-9-]{0,31}$/u;

function assertTargetForm(target: string): void {
  if (!TARGET_FORM.test(target)) {
    throw new InvalidArgumentError(`"${target}" is not of the form <kind>/<id>.`);
  }
}

function engineAt(cwd: string, projectRoot?: string): Promise<SpecFlowEngine> {
  return openSpecFlowEngine({ cwd, ...(projectRoot ? { projectRoot } : {}) });
}
