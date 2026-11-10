// The `nevo-docs` program: the product `docs` command adapter (`createDocsCommand`, the same one
// `nevo-specflow docs` mounts) with this repository's hints and ADR rules, plus `adr new` and the
// manual retrieval `eval`.

import { loadDocsSettings, openFileSystemCorpus, type DocsCorpusRules } from '@nevo/specflow-docs';
import { createDocsCommand, type DocsCommandContext } from '@nevo/specflow-docs/cli';
import type { Command } from 'commander';

import { join } from 'node:path';
import process from 'node:process';

import { createAdr } from '../app/create-adr.js';
import { runEval, type EvalReport } from '../app/run-eval.js';
import { validateAdrs } from '../domain/adr.js';
import { createAdrFiles } from '../infra/adr-files.js';
import { readEvalQuestions } from '../infra/eval-questions.js';

export type LauncherContext = Pick<
  DocsCommandContext,
  | 'resolveProject'
  | 'stdout'
  | 'stderr'
  | 'env'
  | 'createEmbeddingProvider'
  | 'backgroundIndex'
  | 'spawnDetached'
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
    semanticStatusCommand: 'pnpm docs:semantic status',
    corpusRules: REPOSITORY_CORPUS_RULES,
  })
    .name('nevo-docs')
    .description(
      'Documentation commands of this repository: the product `nevo-specflow docs` adapter plus ADR authoring (not a product CLI)',
    );

  addAdrCommand(program, ctx);
  addEvalCommand(program, ctx);

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

/** The question set below the project root. */
export const EVAL_QUESTIONS_FILE = 'tools/docs/eval/questions.yaml';

function addEvalCommand(program: Command, ctx: LauncherContext): void {
  program
    .command('eval')
    .description(
      'Score `search` against the repository question set: Recall@5, Recall@10, MRR and non-authoritative hits (manual, uses the local index; embeds nothing)',
    )
    .option('--questions <file>', 'question set (YAML)', EVAL_QUESTIONS_FILE)
    .option('--json', 'emit JSON on stdout', false)
    .action(async (opts: { questions: string; json: boolean }) => {
      const project = await ctx.resolveProject();
      const questions = readEvalQuestions(join(project.root, opts.questions));
      const report = await runEval(
        project,
        REPOSITORY_CORPUS_RULES,
        questions,
        ctx.env ?? process.env,
      );
      if (opts.json) {
        ctx.stdout(JSON.stringify(report, null, 2));

        return;
      }

      printReport(ctx, report);
    });
}

function printReport(ctx: LauncherContext, report: EvalReport): void {
  const fixed = (value: number) => value.toFixed(3);
  for (const result of report.results) {
    const rank = result.reciprocalRank === 0 ? '-' : String(Math.round(1 / result.reciprocalRank));
    ctx.stdout(
      `R@5 ${fixed(result.recallAt5)}  R@10 ${fixed(result.recallAt10)}  first ${rank.padStart(2)}  ${result.mode}  ${result.question}`,
    );
    if (result.recallAt10 < 1) {
      const missing = result.expected.filter((id) => !result.ids.includes(id));
      ctx.stdout(`    missing: ${missing.join(', ')}; top 3: ${result.ids.slice(0, 3).join(', ')}`);
    }
  }

  const { summary } = report;
  ctx.stdout('');
  ctx.stdout(
    `questions ${summary.questions}  Recall@5 ${fixed(summary.recallAt5)}  Recall@10 ${fixed(summary.recallAt10)}  MRR ${fixed(summary.mrr)}  non-authoritative in top 10: ${summary.nonAuthoritativeHits}`,
  );
  const lexical = report.results.filter((result) => result.mode !== 'hybrid').length;
  if (lexical > 0) {
    ctx.stderr(
      `warning: ${lexical} question(s) answered lexically; run \`pnpm docs:semantic index\` first`,
    );
  }
}
