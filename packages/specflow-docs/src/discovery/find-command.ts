import type { Command } from 'commander';

import { findDocuments } from './documents';
import type { ScoredDoc } from './frontmatter-search';
import { DocsUsageError } from '../errors';
import { positiveInteger, runDocsAction, type DocsCommandContext } from '../command/context';
import type { OpenCorpus } from '../command/open-project';

interface FindCliOptions {
  readonly type?: string;
  readonly status?: string;
  readonly scope?: string;
  readonly area?: string;
  readonly tag?: string;
  readonly limit?: number;
  readonly json: boolean;
}

export function addFindCommand(docs: Command, ctx: DocsCommandContext, open: OpenCorpus): void {
  const command = docs
    .command('find')
    .description('Find every document matching any query term, ranked deterministically')
    .argument('<query...>', 'search terms (OR semantics)')
    .option('--type <type>', 'filter by doc type')
    .option('--status <status>', 'filter by status')
    .option('--scope <scope>', 'filter by taxonomy scope')
    .option('--area <area>', 'filter by taxonomy area')
    .option('--tag <tag>', 'filter by taxonomy tag')
    .option('--limit <n>', 'maximum results; omitted means all matches', positiveInteger)
    .option('--json', 'emit JSON on stdout', false);

  command.action((queryParts: string[], opts: FindCliOptions) =>
    runDocsAction(command, async () => {
      const query = queryParts.join(' ').trim();
      if (!query) {
        throw new DocsUsageError('find: a query is required');
      }

      const { json, ...filters } = opts;
      const results = findDocuments(await open(), { query, ...filters });
      if (json) {
        ctx.stdout(JSON.stringify(results, null, 2));

        return;
      }

      if (results.length === 0) {
        ctx.stdout(`(no documents match "${query}")`);

        return;
      }

      for (const d of results) {
        ctx.stdout(`${String(d.id)} — "${String(d.title)}"  ${d.file}`);
        const scored = d as Partial<ScoredDoc>;
        const why: string[] = [];
        if (scored.matchedTerms?.length) {
          why.push(`terms: ${scored.matchedTerms.join(', ')}`);
        }

        if (scored.matchedFields?.length) {
          why.push(`in: ${scored.matchedFields.join(', ')}`);
        }

        if (why.length) {
          ctx.stdout(`    (${why.join('; ')})`);
        }
      }
    }),
  );
}
