import { Command } from 'commander';

import { findDocuments } from '../../app/find-documents.js';
import { UsageError } from '../../errors.js';
import type { ScoredDoc } from '../../domain/search.js';
import type { DocsCliContext } from '../context.js';

export function findCommand(ctx: DocsCliContext): Command {
  return new Command('find')
    .description('Find every document matching any query term, ranked deterministically')
    .argument('<query...>', 'search terms (OR semantics)')
    .option('--type <type>', 'filter by doc type')
    .option('--status <status>', 'filter by status')
    .option('--scope <scope>', 'filter by taxonomy scope')
    .option('--area <area>', 'filter by taxonomy area')
    .option('--tag <tag>', 'filter by taxonomy tag')
    .option('--limit <n>', 'maximum results; omitted means all matches')
    .option('--json', 'emit JSON on stdout', false)
    .action(
      (
        queryParts: string[],
        opts: {
          type?: string;
          status?: string;
          scope?: string;
          area?: string;
          tag?: string;
          limit?: string;
          json: boolean;
        },
      ) => {
        const query = queryParts.join(' ').trim();
        if (!query) throw new UsageError('find: a query is required');
        const limit = opts.limit === undefined ? undefined : Number(opts.limit);
        if (opts.limit !== undefined && (!Number.isInteger(limit) || (limit ?? 0) <= 0)) {
          throw new UsageError('find: --limit must be a positive integer');
        }
        const results = findDocuments(ctx.repo, {
          query,
          type: opts.type,
          status: opts.status,
          scope: opts.scope,
          area: opts.area,
          tag: opts.tag,
          limit,
        });
        if (opts.json) {
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
          if (scored.matchedTerms?.length) why.push(`terms: ${scored.matchedTerms.join(', ')}`);
          if (scored.matchedFields?.length) why.push(`in: ${scored.matchedFields.join(', ')}`);
          if (why.length) ctx.stdout(`    (${why.join('; ')})`);
        }
      },
    );
}
