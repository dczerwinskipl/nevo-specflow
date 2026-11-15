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
  EVAL_GROUPS,
  runEval,
  type EvalFloor,
  type EvalQuestionResult,
  type EvalReport,
} from '../app/run-eval.js';
import { validateAdrs } from '../domain/adr.js';
import { validateRoadmapTables } from '../domain/markdown-tables.js';
import { generateRandomQueries } from '../domain/random-queries.js';
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
export const REPOSITORY_CORPUS_RULES: DocsCorpusRules = {
  validate: (docs) => [...validateAdrs(docs), ...validateRoadmapTables(docs)],
};

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
      'Score context, lexical and hybrid search against the repository question set: Recall@5, Recall@10 and MRR per language and question class, false positives of questions without an answer, vector similarity diagnostics and proposal hits (manual, uses the local index; embeds no documents)',
    )
    .option('--questions <file>', 'question set (YAML)', EVAL_QUESTIONS_FILE)
    .option(
      '--min-similarity <floors>',
      "comma-separated relevance floors of the hybrid variant, 'none' for no floor (default: the configured ai.embeddings.minSimilarity)",
    )
    .option(
      '--query-instruction <text>',
      'replace ai.embeddings.queryInstruction for this run (the literal query prefix)',
    )
    .option('--no-query-instruction', 'run without ai.embeddings.queryInstruction')
    .option(
      '--random <count>',
      'add <count> generated nonsense strings (seeded) to the questions',
      '0',
    )
    .option('--json', 'emit JSON on stdout', false)
    .action(
      async (opts: {
        questions: string;
        minSimilarity?: string;
        queryInstruction?: string | boolean;
        random: string;
        json: boolean;
      }) => {
        const project = await ctx.resolveProject();
        const questions = [
          ...readEvalQuestions(join(project.root, opts.questions)),
          ...generateRandomQueries(Number(opts.random)),
        ];
        const report = await runEval(
          project,
          REPOSITORY_CORPUS_RULES,
          questions,
          ctx.env ?? process.env,
          {
            ...(opts.minSimilarity === undefined
              ? {}
              : { floors: parseFloors(opts.minSimilarity) }),
            ...(opts.queryInstruction === undefined || opts.queryInstruction === true
              ? {}
              : {
                  queryInstruction: opts.queryInstruction === false ? null : opts.queryInstruction,
                }),
          },
        );
        if (opts.json) {
          ctx.stdout(JSON.stringify(report, null, 2));

          return;
        }

        printReport(ctx, report);
      },
    );
}

/** `none,0.5,0.52` as floors; each is `none` or a number with `0 <= floor < 1`. */
export function parseFloors(text: string): EvalFloor[] {
  return text.split(',').map((entry) => {
    const value = entry.trim();
    if (value === 'none') {
      return null;
    }

    const floor = Number(value);
    if (value === '' || !(floor >= 0 && floor < 1)) {
      throw new Error(
        `--min-similarity: '${value}' is neither 'none' nor a number with 0 <= x < 1`,
      );
    }

    return floor;
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
  const names = report.variants.map((variant) => variant.name);

  ctx.stdout(
    `model: ${report.model ?? '-'}; query instruction: ${report.queryInstruction === undefined ? 'none' : JSON.stringify(report.queryInstruction)}`,
  );
  ctx.stdout(
    `first expected rank (answerable) or vector-only documents (no answer) per variant: ${names.join(' / ')}; best vector similarity`,
  );
  for (const result of report.results) {
    const answerable = result.expected.length > 0;
    const cells = names.map((name) => {
      const variant = result.variants[name]!;

      return answerable ? rank(variant.score) : String(variant.vectorOnly).padStart(2);
    });
    ctx.stdout(
      `${cells.join(' /')}  ${similarity(result.bestSimilarity)}  ${result.class.padEnd(8)} ${(result.lang ?? '-').padEnd(2)}  ${JSON.stringify(result.question)}`,
    );
    const hybrid = result.variants[names[2] ?? '']!;
    if (hybrid?.score !== undefined && hybrid.score.recallAt10 < 1) {
      const missing = result.expected.filter((id) => !hybrid.ids.includes(id));
      ctx.stdout(
        `    ${names[2]} misses: ${missing.join(', ')}; top 3: ${hybrid.ids.slice(0, 3).join(', ')}`,
      );
    }
  }

  ctx.stdout('');
  ctx.stdout('variant          group    questions  Recall@5  Recall@10  MRR');
  for (const variant of report.variants) {
    for (const group of EVAL_GROUPS) {
      const summary = variant.summaries[group];
      if (summary.questions === 0) {
        continue;
      }

      ctx.stdout(
        `${variant.name.padEnd(15)}  ${group.padEnd(7)}  ${String(summary.questions).padStart(9)}  ${fixed(summary.recallAt5).padStart(8)}  ${fixed(summary.recallAt10).padStart(9)}  ${fixed(summary.mrr)}`,
      );
    }
  }

  ctx.stdout('');
  ctx.stdout(
    'false positives (questions without an answer that got a vector-only document) / with any document:',
  );
  for (const variant of report.variants) {
    const { negative, random, all } = variant.falsePositives;
    const cell = (counts: typeof all) =>
      `${counts.withVectorOnly}/${counts.questions} (any ${counts.withAny})`;
    ctx.stdout(
      `${variant.name.padEnd(15)}  negative ${cell(negative)}  random ${cell(random)}  all ${cell(all)}`,
    );
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
    `proposals in the first hybrid top 10: ${report.proposalHits} (filter check); ranked above the first expected when included: ${report.proposalsAboveExpected}`,
  );
  const lexical = report.results.filter(
    (result) => result.hybridMode !== 'hybrid' && result.hybridMode !== '-',
  ).length;
  if (lexical > 0) {
    ctx.stderr(
      `warning: ${lexical} question(s) answered lexically in the hybrid variant; run \`pnpm docs:semantic index\` first`,
    );
  }
}
