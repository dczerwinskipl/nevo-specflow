import type { Command } from 'commander';

import { getDocuments } from './documents';
import { runDocsAction, type DocsCommandContext } from '../cli/context';
import type { OpenCorpus } from '../cli/open-corpus';

export function addGetCommand(docs: Command, ctx: DocsCommandContext, open: OpenCorpus): void {
  const command = docs
    .command('get')
    .description('Resolve one or more exact active stable document ids')
    .argument('<id...>', 'stable document ids')
    .option('--json', 'emit JSON on stdout', false);

  command.action((ids: string[], opts: { json: boolean }) =>
    runDocsAction(command, async () => {
      const entries = getDocuments(await open(), ids);
      if (opts.json) {
        ctx.stdout(JSON.stringify(entries, null, 2));

        return;
      }

      for (const entry of entries) {
        ctx.stdout(`${entry.id} — "${entry.title}" [${entry.status}]  ${entry.file}`);
        if (entry.summary) {
          ctx.stdout(`    ${entry.summary.replace(/\s+/g, ' ').trim()}`);
        }
      }
    }),
  );
}
