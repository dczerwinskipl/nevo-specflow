import type { Command } from 'commander';

import type { DocsSearchResult } from '@nevo/specflow-contracts/docs';

import { DocsUsageError } from '../../errors';
import { openDocsSearch, searchDocumentation } from '../../semantic/docs-search';
import { positiveInteger, runDocsAction, type DocsCommandContext } from '../context';
import type { OpenProject } from '../open-corpus';

/** Documents returned when `--limit` is omitted. */
export const DEFAULT_SEARCH_LIMIT = 10;

interface SearchCliOptions {
  readonly limit: number;
  readonly includeNonAuthoritative: boolean;
  readonly refresh: boolean;
  readonly json: boolean;
}

export function addSearchCommand(docs: Command, ctx: DocsCommandContext, open: OpenProject): void {
  const command = docs
    .command('search')
    .description(
      'Answer a natural-language question with ranked document sections (hybrid when semantic search is available, lexical otherwise)',
    )
    .argument('<question...>', 'the question, in your own words')
    .option('--limit <n>', 'maximum documents', positiveInteger, DEFAULT_SEARCH_LIMIT)
    .option(
      '--include-non-authoritative',
      'also return documents under the non-authoritative prefixes',
      false,
    )
    .option(
      '--no-refresh',
      'answer from the index as it is, without re-embedding changed documents',
    )
    .option('--json', 'emit JSON on stdout', false);

  command.action((questionParts: string[], opts: SearchCliOptions) =>
    runDocsAction(command, async () => {
      const query = questionParts.join(' ').trim();
      if (!query) {
        throw new DocsUsageError('search: a question is required');
      }

      const { project, configuration, corpus } = await open();
      const search = openDocsSearch({
        projectRoot: project.root,
        corpus,
        configuration,
        env: ctx.env ?? process.env,
        ...(ctx.createEmbeddingProvider ? { createProvider: ctx.createEmbeddingProvider } : {}),
      });
      const result = await searchDocumentation(search, {
        query,
        limit: opts.limit,
        includeNonAuthoritative: opts.includeNonAuthoritative,
        refresh: opts.refresh,
      });

      if (opts.json) {
        ctx.stdout(JSON.stringify(result, null, 2));

        return;
      }

      printResult(ctx, query, result);
    }),
  );
}

function printResult(ctx: DocsCommandContext, query: string, result: DocsSearchResult): void {
  ctx.stdout(
    result.mode === 'hybrid'
      ? 'mode: hybrid'
      : `mode: lexical (${result.reason.code}: ${result.reason.message})`,
  );
  if (result.results.length === 0) {
    ctx.stdout(`(no documents match "${query}")`);

    return;
  }

  const getCommand = ctx.getCommand ?? 'nevo-specflow docs get';
  for (const hit of result.results) {
    ctx.stdout('');
    ctx.stdout(`${hit.id} — "${hit.title}"  ${hit.file}  (score ${hit.score.toFixed(4)})`);
    for (const chunk of hit.chunks) {
      ctx.stdout(`  in: ${chunk.headingPath.join(' > ') || '(top)'}`);
      if (chunk.snippet) {
        ctx.stdout(`    ${chunk.snippet}`);
      }
    }

    ctx.stdout(`  read: ${getCommand} ${hit.id}`);
  }
}
