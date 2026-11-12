import type { Command } from 'commander';

import { getContext } from './documents';
import { DocsUsageError } from '../errors';
import {
  positiveInteger,
  runDocsAction,
  warnSkipped,
  type DocsCommandContext,
} from '../command/context';
import type { OpenCorpus } from '../command/open-project';

export function addContextCommand(docs: Command, ctx: DocsCommandContext, open: OpenCorpus): void {
  const command = docs
    .command('context')
    .description(
      'Print the files to load for a task (inactive and non-authoritative documents excluded)',
    )
    .argument('<query...>', 'task description terms')
    .option('--limit <n>', 'maximum files; omitted means all matches', positiveInteger)
    .option('--json', 'emit JSON on stdout', false);

  command.action((queryParts: string[], opts: { limit?: number; json: boolean }) =>
    runDocsAction(command, async () => {
      const query = queryParts.join(' ').trim();
      if (!query) {
        throw new DocsUsageError('context: a query is required');
      }

      const { documents: entries, skipped } = getContext(await open(), {
        query,
        ...(opts.limit === undefined ? {} : { limit: opts.limit }),
      });
      if (opts.json) {
        ctx.stdout(JSON.stringify({ documents: entries, skipped }, null, 2));

        return;
      }

      warnSkipped(ctx, skipped);
      if (entries.length === 0) {
        ctx.stdout(`(no context found for "${query}")`);

        return;
      }

      ctx.stdout(`# Context for: ${query}`);
      ctx.stdout('# Read these files, most relevant first:');
      ctx.stdout('');
      for (const e of entries) {
        ctx.stdout(e.file);
        if (e.summary) {
          ctx.stdout(`  ${e.summary.replace(/\s+/g, ' ').trim()}`);
        }
      }
    }),
  );
}
