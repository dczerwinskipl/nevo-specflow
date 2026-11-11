// The `nevo-docs` program: the product `docs` command adapter (`createDocsCommand`, the same one
// `nevo-specflow docs` mounts) with this repository's hints and ADR rules, plus `adr new` and the
// manual retrieval `eval`.

import { loadDocsSettings, openFileSystemCorpus, type DocsCorpusRules } from '@nevo/specflow-docs';
import { createDocsCommand, type DocsCommandContext } from '@nevo/specflow-docs/cli';
import type { Command } from 'commander';

import { join } from 'node:path';
import process from 'node:process';

import { createAdr } from '../app/create-adr.js';
import {
  EVAL_VARIANTS,
  runEval,
  type EvalQuestionResult,
  type EvalReport,
} from '../app/run-eval.js';
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
      'Score find, lexical and hybrid search against the repository question set: Recall@5, Recall@10 and MRR per language, vector similarity diagnostics and non-authoritative hits (manual, uses the local index; embeds no documents)',
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
  const rank = (score: { readonly reciprocalRank: number } | undefined) =>
    score === undefined || score.reciprocalRank === 0
      ? ' -'
      : String(Math.round(1 / score.reciprocalRank)).padStart(2);
  const similarity = (value: number | undefined) =>
    value === undefined ? 'sim   -  ' : `sim ${fixed(value)}`;

  ctx.stdout('first expected rank per variant (find / lexical / hybrid), best vector similarity:');
  for (const result of report.results) {
    const { find, lexical, hybrid } = result.variants;
    const answer =
      result.expected.length === 0
        ? 'no answer   '
        : `${rank(find.score)} /${rank(lexical.score)} /${rank(hybrid.score)}`;
    ctx.stdout(
      `${answer}  ${similarity(result.bestSimilarity)}  ${result.lang}  ${result.question}`,
    );
    if (hybrid.score !== undefined && hybrid.score.recallAt10 < 1) {
      const missing = result.expected.filter((id) => !hybrid.ids.includes(id));
      ctx.stdout(
        `    hybrid misses: ${missing.join(', ')}; top 3: ${hybrid.ids.slice(0, 3).join(', ')}`,
      );
    }
  }

  ctx.stdout('');
  ctx.stdout('variant  lang  questions  Recall@5  Recall@10  MRR');
  for (const variant of EVAL_VARIANTS) {
    for (const lang of ['all', 'en', 'pl'] as const) {
      const summary = report.summaries[variant][lang];
      ctx.stdout(
        `${variant.padEnd(7)}  ${lang.padEnd(4)}  ${String(summary.questions).padStart(9)}  ${fixed(summary.recallAt5).padStart(8)}  ${fixed(summary.recallAt10).padStart(9)}  ${fixed(summary.mrr)}`,
      );
    }
  }

  const answerable = report.results.filter((result) => result.expected.length > 0);
  const unanswerable = report.results.filter((result) => result.expected.length === 0);
  const similarities = (results: readonly EvalQuestionResult[]) =>
    results.flatMap((result) => result.bestSimilarity ?? []);
  const range = (values: readonly number[]) =>
    values.length === 0
      ? '-'
      : `min ${fixed(Math.min(...values))}, mean ${fixed(values.reduce((sum, value) => sum + value, 0) / values.length)}, max ${fixed(Math.max(...values))}`;
  ctx.stdout('');
  ctx.stdout(`best vector similarity, answerable: ${range(similarities(answerable))}`);
  ctx.stdout(`best vector similarity, no answer:  ${range(similarities(unanswerable))}`);
  ctx.stdout(
    `non-authoritative in the hybrid top 10: ${report.nonAuthoritativeHits} (filter check); ranked above the first expected when included: ${report.nonAuthoritativeAboveExpected}`,
  );
  const lexical = report.results.filter((result) => result.hybridMode !== 'hybrid').length;
  if (lexical > 0) {
    ctx.stderr(
      `warning: ${lexical} question(s) answered lexically in the hybrid variant; run \`pnpm docs:semantic index\` first`,
    );
  }
}
