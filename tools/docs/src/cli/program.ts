// The `nevo-docs` program: the product `docs` command adapter (`createDocsCommand`, the same one
// `nevo-specflow docs` mounts) with this repository's hints and ADR rules, plus `adr new`.

import { loadDocsSettings, openFileSystemCorpus, type DocsCorpusRules } from '@nevo/specflow-docs';
import { createDocsCommand, type DocsCommandContext } from '@nevo/specflow-docs/cli';
import type { Command } from 'commander';

import { createAdr } from '../app/create-adr.js';
import { validateAdrs } from '../domain/adr.js';
import { createAdrFiles } from '../infra/adr-files.js';

export type LauncherContext = Pick<
  DocsCommandContext,
  'resolveProject' | 'stdout' | 'stderr' | 'env' | 'createEmbeddingProvider'
>;

/** Repository-only checks on top of the product contract (ADR 0020). */
export const REPOSITORY_CORPUS_RULES: DocsCorpusRules = { validate: validateAdrs };

/** Build the `nevo-docs` program. Pure wiring — no argv parsing here. */
export function createProgram(ctx: LauncherContext): Command {
  const program = createDocsCommand({
    ...ctx,
    checkWriteCommand: 'pnpm docs:check --write',
    getCommand: 'pnpm docs:get',
    semanticIndexCommand: 'pnpm docs:semantic index',
    corpusRules: REPOSITORY_CORPUS_RULES,
  })
    .name('nevo-docs')
    .description(
      'Documentation commands of this repository: the product `nevo-specflow docs` adapter plus ADR authoring (not a product CLI)',
    );

  addAdrCommand(program, ctx);

  // Route every exit (help, parse error, thrown errors) through bin.ts.
  const overrideExit = (command: Command): void => {
    command.exitOverride();
    command.commands.forEach(overrideExit);
  };

  overrideExit(program);

  return program;
}

function addAdrCommand(program: Command, ctx: LauncherContext): void {
  const adr = program.command('adr').description('Architecture Decision Record authoring');

  adr
    .command('new')
    .description('Create the next-numbered ADR from the template (as a draft)')
    .argument('<title...>', 'the decision title')
    .option('--dry-run', 'print the file that would be created; write nothing', false)
    .option('--json', 'emit JSON on stdout', false)
    .action(async (titleParts: string[], opts: { dryRun: boolean; json: boolean }) => {
      const project = await ctx.resolveProject();
      const { docs } = loadDocsSettings(project);
      const corpus = openFileSystemCorpus(project.root, docs, REPOSITORY_CORPUS_RULES);
      const result = createAdr(corpus, createAdrFiles(project.root, docs.root), {
        title: titleParts.join(' ').trim(),
        dryRun: opts.dryRun,
      });

      if (opts.dryRun) {
        if (opts.json) {
          ctx.stdout(JSON.stringify(result.plan, null, 2));

          return;
        }

        ctx.stdout(`# would create ${result.plan.file}\n`);
        ctx.stdout(result.plan.content);

        return;
      }

      if (opts.json) {
        ctx.stdout(JSON.stringify({ ...result.plan, indexRegenerated: true }, null, 2));

        return;
      }

      ctx.stdout(`Created ${result.plan.file} (status: draft)`);
      ctx.stdout(`Regenerated ${docs.root}/index.generated.{md,json}`);
      ctx.stdout(
        'Fill in the TODO sections, then promote status to `current` when the decision is adopted.',
      );
    });
}
