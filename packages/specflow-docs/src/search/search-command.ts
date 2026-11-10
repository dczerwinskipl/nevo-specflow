import type { Command } from 'commander';

import type {
  DocsSearchHit,
  DocsSearchResult,
  DocsSearchSection,
} from '@nevo/specflow-contracts/docs';

import { DocsUsageError } from '../errors';
import { cutAtWord } from './result';
import { openDocsSearch, searchDocumentation } from './search';
import { positiveInteger, runDocsAction, type DocsCommandContext } from '../command/context';
import type { OpenProject } from '../command/open-project';
import { createProcessCatchUp } from '../semantic-index/catch-up';
import { spawnDetachedProcess } from '../semantic-index/detached-process';
import { openProjectIndex } from '../semantic-index/index-store';
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
    .option('--no-snippets', 'show no excerpt under each matching section')
    .option('--json', 'emit JSON on stdout', false);

  command.action((questionParts: string[], opts: SearchCliOptions) =>
    runDocsAction(command, async () => {
      const query = questionParts.join(' ').trim();
      if (!query) {
        throw new DocsUsageError('search: a question is required');
      }

      const { project, configuration, corpus } = await open();
      const index = await openProjectIndex(project.root, corpus, configuration, ctx.isIgnoredByGit);
      const search = openDocsSearch({
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

  for (const hit of result.results) {
    ctx.stdout('');
    ctx.stdout(`${hit.id} — ${hit.title} (${hit.type}, ${hit.status})`);
    if (hit.summary) {
      ctx.stdout(`  ${cutAtWord(hit.summary, SUMMARY_TEXT_MAX_CHARS)}`);
    }

    if (hit.readWhen) {
      ctx.stdout(`  read when: ${hit.readWhen.join('; ')}`);
    }

    if (hit.sections.length > 0) {
      ctx.stdout('  sections:');
      for (const section of hit.sections) {
        ctx.stdout(
          `    ${sectionHeading(section.headingPath, hit.title)}  [${section.sectionId}, line ${String(section.line)}]`,
        );
        if (section.snippet) {
          ctx.stdout(`      ${section.snippet}`);
        }
      }
    }
  }

  ctx.stdout('');
  ctx.stdout(`read all: ${readAllCommand(result, ctx.getCommand ?? 'nevo-specflow docs get')}`);
}

/**
 * One line that reads every result, commands separated by `; ` (bash and PowerShell alike): first
 * `<get> --content <ids...>` for the documents read whole, then `<get> <id> --section
 * <sectionId>...` for each `reference` document with matching sections, in result order.
 * Reference documents are large lookup tables (routes, options, configuration keys) whose matching
 * sections answer the question; other documents are meant to be read whole. `get --section`
 * includes subsections, so a matching section inside another matching one is not named again, and
 * a reference document whose matching sections include a top-level section (with its subsections
 * most or all of the document) is read whole too.
 */
export function readAllCommand(result: DocsSearchResult, getCommand: string): string {
  const sections = new Map(
    result.results.map((hit) => [
      hit.id,
      hit.type === 'reference' ? outermostSections(hit.sections) : [],
    ]),
  );
  const bySection = (hit: DocsSearchHit) => {
    const selected = sections.get(hit.id)!;

    return selected.length > 0 && selected.every((section) => section.headingPath.length !== 1);
  };

  const whole = result.results.filter((hit) => !bySection(hit)).map((hit) => hit.id);
  const commands = [
    ...(whole.length > 0 ? [`${getCommand} --content ${whole.join(' ')}`] : []),
    ...result.results.filter(bySection).map(
      (hit) =>
        `${getCommand} ${hit.id} ${sections
          .get(hit.id)!
          .map((section) => `--section ${section.sectionId}`)
          .join(' ')}`,
    ),
  ];

  return commands.join('; ');
}

/** The sections not inside another of them (a longer heading path that starts with its path). */
function outermostSections(sections: readonly DocsSearchSection[]): DocsSearchSection[] {
  const inside = (inner: DocsSearchSection, outer: DocsSearchSection) =>
    inner.line > outer.line &&
    outer.headingPath.length > 0 &&
    inner.headingPath.length > outer.headingPath.length &&
    outer.headingPath.every((heading, index) => inner.headingPath[index] === heading);

  return sections.filter((section) => !sections.some((other) => inside(section, other)));
}

/**
 * How text output names a section: its heading path without a first heading equal to the document
 * title (the usual H1). The title heading's own section is `(document)`, since with its
 * subsections it is the whole document; the text before the first heading is
 * `(before the first heading)`.
 */
function sectionHeading(path: readonly string[], title: string): string {
  if (path.length === 0) {
    return '(before the first heading)';
  }

  const shown = path[0] === title ? path.slice(1) : path;

  return shown.join(' > ') || '(document)';
}
