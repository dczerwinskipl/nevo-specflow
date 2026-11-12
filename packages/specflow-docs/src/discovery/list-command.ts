import type { Command } from 'commander';

import { findDocuments } from './documents';
import { runDocsAction, warnSkipped, type DocsCommandContext } from '../command/context';
import type { OpenCorpus } from '../command/open-project';

export function addListCommand(docs: Command, ctx: DocsCommandContext, open: OpenCorpus): void {
  const command = docs
    .command('list')
    .description('List every document (all statuses)')
    .option('--type <type>', 'filter by doc type')
    .option('--status <status>', 'filter by status')
    .option('--json', 'emit JSON on stdout', false);

  command.action((opts: { type?: string; status?: string; json: boolean }) =>
    runDocsAction(command, async () => {
      const { documents: found, skipped } = findDocuments(await open(), {
        ...(opts.type === undefined ? {} : { type: opts.type }),
        ...(opts.status === undefined ? {} : { status: opts.status }),
      });
      if (opts.json) {
        ctx.stdout(JSON.stringify({ documents: found, skipped }, null, 2));

        return;
      }

      warnSkipped(ctx, skipped);
      if (found.length === 0) {
        ctx.stdout('(no documents match)');

        return;
      }

      for (const d of found) {
        ctx.stdout(`${String(d.id).padEnd(40)} ${String(d.status).padEnd(10)} ${d.file}`);
      }
    }),
  );
}
