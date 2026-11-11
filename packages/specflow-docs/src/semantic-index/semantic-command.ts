import type { Command } from 'commander';

import { DocsError } from '../errors';
import { buildDocsIndex } from './build';
import type { SemanticEnvironment } from './environment';
import { openProjectIndex } from './index-store';
import { createReachabilityCache } from './reachability';
import { semanticStatus, type SemanticStatus } from './status';
import { runDocsAction, type DocsCommandContext } from '../command/context';
import type { OpenProject } from '../command/open-project';

function environment(ctx: DocsCommandContext): SemanticEnvironment {
  return {
    env: ctx.env ?? process.env,
    ...(ctx.createEmbeddingProvider ? { createProvider: ctx.createEmbeddingProvider } : {}),
  };
}

export function addSemanticCommand(
  docs: Command,
  ctx: DocsCommandContext,
  open: OpenProject,
): void {
  const semantic = docs
    .command('semantic')
    .description('Inspect and build the semantic search index');

  // One per CLI process, like the Runtime's per instance (`SemanticStatusOptions.reachability`).
  const reachability = createReachabilityCache(ctx.now ? { now: ctx.now } : {});
  const status = semantic
    .command('status')
    .description(
      'Report the semantic search configuration, endpoint reachability, index freshness and the mode search answers in; exits 1 when semantic search is enabled but the configuration, endpoint or index prevents it',
    )
    .option('--json', 'emit JSON on stdout', false);

  status.action((opts: { json: boolean }) =>
    runDocsAction(status, async () => {
      const { project, configuration, corpus } = await open();
      const report = await semanticStatus(
        await openProjectIndex(project.root, corpus, configuration, ctx.isIgnoredByGit),
        configuration,
        environment(ctx),
        {
          ...(ctx.semanticIndexCommand === undefined
            ? {}
            : { semanticIndexCommand: ctx.semanticIndexCommand }),
          backgroundCatchUp: ctx.backgroundIndex !== undefined,
          reachability,
        },
      );
      if (opts.json) {
        ctx.stdout(JSON.stringify(report, null, 2));
      } else {
        printStatus(ctx, report);
      }

      if (report.failed) {
        throw new DocsError(
          `semantic search is enabled but unavailable: ${report.mode === 'lexical' ? report.reason.message : 'unknown cause'}`,
        );
      }
    }),
  );

  const index = semantic
    .command('index')
    .description(
      'Embed new and changed documents now (everything after a model or chunker change); exits 1 when the index is not up to date afterwards',
    );

  index.action(() =>
    runDocsAction(index, async () => {
      const { project, configuration, corpus } = await open();
      const result = await buildDocsIndex(
        await openProjectIndex(project.root, corpus, configuration, ctx.isIgnoredByGit),
        configuration,
        environment(ctx),
        ({ embedded, total }) => {
          ctx.stderr(`embedded ${String(embedded)}/${String(total)} chunks`);
        },
      );
      // An explicit build that did not bring the index up to date fails (exit 1), so automation
      // can rely on it; `search` degrades to lexical instead.
      if (result.status === 'not-attempted') {
        throw new DocsError(`Index not built (${result.reason.code}): ${result.reason.message}`);
      }

      const { outcome } = result;
      if (outcome.status === 'current') {
        ctx.stdout(`Index current (generation ${String(outcome.generation)}).`);
      } else if (outcome.status === 'refreshed') {
        ctx.stdout(
          `Index ${outcome.rebuilt ? 'rebuilt' : 'refreshed'}: embedded ${String(outcome.embedded)}, deleted ${String(outcome.deleted)} chunks (generation ${String(outcome.generation)}).`,
        );
      } else {
        throw new DocsError(
          `Index not updated (${result.reason?.code ?? outcome.status}): ${result.reason?.message ?? outcome.status}`,
        );
      }
    }),
  );
}

function printStatus(ctx: DocsCommandContext, report: SemanticStatus): void {
  ctx.stdout(`semantic search: ${report.enabled ? 'enabled' : 'not enabled'}`);
  if (report.endpoint === null) {
    ctx.stdout('endpoint: not configured');
  } else {
    const { protocol, baseUrl, model, spaceId, dimensions, apiKeyEnv } = report.endpoint;
    ctx.stdout(
      `endpoint: ${protocol} ${baseUrl}  model ${model}${spaceId === undefined ? '' : `  space ${spaceId}`}${
        dimensions === undefined ? '' : `  dimensions ${String(dimensions)}`
      }${apiKeyEnv === undefined ? '' : `  key from ${apiKeyEnv}`}`,
    );
  }

  if (report.reachability !== null) {
    ctx.stdout(
      report.reachability.reachable
        ? `reachable: yes (${String(Math.round(report.reachability.latencyMs))} ms, ${String(report.reachability.dimensions)} dimensions)`
        : `reachable: no (${report.reachability.message})`,
    );
  }

  const { index } = report;
  switch (index.state) {
    case 'missing':
      ctx.stdout('index: not built yet');
      break;
    case 'unreadable':
      ctx.stdout(`index: unreadable (${index.message})`);
      break;
    default:
      ctx.stdout(
        `index: ${index.state}${index.changed > 0 ? ` (${String(index.changed)} chunks to update)` : ''}  generation ${String(index.generation)}, ${String(index.chunks)} chunks, ${index.model} / ${String(index.dimensions)} dimensions`,
      );
  }

  const activity = activityLine(report.activity);
  if (activity !== undefined) {
    ctx.stdout(activity);
  }

  ctx.stdout(
    report.mode === 'hybrid'
      ? 'search mode: hybrid'
      : `search mode: lexical (${report.reason.code}: ${report.reason.message})`,
  );
}

function activityLine(activity: SemanticStatus['activity']): string | undefined {
  if (activity.state === 'updating') {
    const who =
      activity.pid === undefined ? 'a writer that is starting' : `process ${String(activity.pid)}`;
    const { progress } = activity;

    return progress === undefined
      ? `updating: ${who} is writing the index`
      : `updating in background: ${String(progress.embedded)}/${String(progress.total)} chunks (since ${progress.startedAt}, ${who})`;
  }

  const { last } = activity;
  if (last === undefined) {
    return undefined;
  }

  const chunks = `${String(last.embedded)}/${String(last.total)} chunks`;
  switch (last.outcome) {
    case 'completed':
      return `last update: completed ${last.endedAt} (embedded ${chunks}${
        last.generation === undefined ? '' : `, generation ${String(last.generation)}`
      })`;
    case 'failed':
      return `last update: failed ${last.endedAt} after ${chunks}: ${last.message ?? 'unknown cause'}`;
    case 'interrupted':
      return `last update: interrupted after ${chunks} (last progress ${last.endedAt})`;
  }
}
