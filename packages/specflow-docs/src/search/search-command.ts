import type { Command } from 'commander';

import type { DocsSearchResult } from '@nevo/specflow-contracts/docs';

import { DocsUsageError } from '../errors';
import { cutAtWord } from './result';
import { openDocsSearch, searchDocumentation } from './search';
import { positiveInteger, runDocsAction, type DocsCommandContext } from '../command/context';
import type { OpenProject } from '../command/open-project';
import { createProcessCatchUp, spawnDetachedProcess } from '../semantic-index/catch-up';
import { openDocsIndex } from '../semantic-index/index-store';
import { SEMANTIC_INDEX_COMMAND, SEMANTIC_STATUS_COMMAND } from '../semantic-index/reasons';

/** Documents returned when `--limit` is omitted. */
export const DEFAULT_SEARCH_LIMIT = 10;
/** Summary characters the text output shows; `--json` carries the whole summary. */
export const SUMMARY_TEXT_MAX_CHARS = 200;

interface SearchCliOptions {
  readonly limit: number;
  readonly includeNonAuthoritative: boolean;
  readonly refresh: boolean;
  readonly snippets: boolean;
  readonly json: boolean;
}

export function addSearchCommand(docs: Command, ctx: DocsCommandContext, open: OpenProject): void {
  const command = docs
    .command('search')
    .description(
      'Answer a natural-language question with ranked documents and their best sections (hybrid when semantic search is available, lexical otherwise)',
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
      'embed no documents; answer lexically unless the index is already complete',
    )
    .option('--snippets', 'show a one-line snippet of each matching section', false)
    .option('--json', 'emit JSON on stdout', false);

  command.action((questionParts: string[], opts: SearchCliOptions) =>
    runDocsAction(command, async () => {
      const query = questionParts.join(' ').trim();
      if (!query) {
        throw new DocsUsageError('search: a question is required');
      }

      const { project, configuration, corpus } = await open();
      const index = openDocsIndex(project.root, corpus);
      const search = openDocsSearch({
        projectRoot: project.root,
        corpus,
        configuration,
        env: ctx.env ?? process.env,
        index,
        ...(ctx.createEmbeddingProvider ? { createProvider: ctx.createEmbeddingProvider } : {}),
        ...(ctx.backgroundIndex
          ? {
              catchUp: createProcessCatchUp({
                directory: index.directory,
                projectRoot: project.root,
                launch: ctx.backgroundIndex,
                spawn: ctx.spawnDetached ?? spawnDetachedProcess,
                now: ctx.now ?? Date.now,
                indexCommand: ctx.semanticIndexCommand ?? SEMANTIC_INDEX_COMMAND,
                statusCommand: ctx.semanticStatusCommand ?? SEMANTIC_STATUS_COMMAND,
              }),
            }
          : {}),
      });
      const result = await searchDocumentation(search, {
        query,
        limit: opts.limit,
        includeNonAuthoritative: opts.includeNonAuthoritative,
        snippets: opts.snippets,
        refresh: opts.refresh,
        ...(ctx.semanticIndexCommand === undefined
          ? {}
          : { semanticIndexCommand: ctx.semanticIndexCommand }),
      });

      if (opts.json) {
        ctx.stdout(JSON.stringify(result, null, 2));

        return;
      }

      printResult(ctx, query, result, opts.snippets);
    }),
  );
}

function printResult(
  ctx: DocsCommandContext,
  query: string,
  result: DocsSearchResult,
  snippets: boolean,
): void {
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
    ctx.stdout(`${hit.id} — ${hit.title} (${hit.type}, ${hit.status})`);
    if (hit.summary) {
      ctx.stdout(`  ${cutAtWord(hit.summary, SUMMARY_TEXT_MAX_CHARS)}`);
    }

    if (hit.readWhen) {
      ctx.stdout(`  read when: ${hit.readWhen.join('; ')}`);
    }

    const heading = (path: readonly string[]) => sectionHeading(path, hit.title);
    if (snippets && hit.sections.length > 0) {
      ctx.stdout('  sections:');
      for (const section of hit.sections) {
        ctx.stdout(`    ${heading(section.headingPath)}: ${section.snippet ?? ''}`);
      }
    } else if (hit.sections.length > 0) {
      ctx.stdout(
        `  sections: ${hit.sections.map((section) => heading(section.headingPath)).join('; ')}`,
      );
    }
  }

  ctx.stdout('');
  ctx.stdout(`read all: ${getCommand} --content ${result.results.map((hit) => hit.id).join(' ')}`);
}

/**
 * A heading path without its first heading when that repeats the document title (the usual H1);
 * `(top)` for the text before or directly under it.
 */
function sectionHeading(path: readonly string[], title: string): string {
  const shown = path[0] === title ? path.slice(1) : path;

  return shown.join(' > ') || '(top)';
}
