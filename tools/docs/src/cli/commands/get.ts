import { Command } from 'commander';

import { getDocuments } from '../../app/find-documents.js';
import type { DocsCliContext } from '../context.js';

export function getCommand(ctx: DocsCliContext): Command {
  return new Command('get')
    .description('Resolve one or more exact stable document ids')
    .argument('<id...>', 'stable document ids')
    .option('--json', 'emit JSON on stdout', false)
    .action((ids: string[], opts: { json: boolean }) => {
      const entries = getDocuments(ctx.repo, ids);
      if (opts.json) {
        ctx.stdout(JSON.stringify(entries, null, 2));
        return;
      }
      for (const entry of entries) {
        ctx.stdout(`${entry.id} — "${entry.title}"  ${entry.file}`);
        if (entry.summary) ctx.stdout(`    ${entry.summary.replace(/\s+/g, ' ').trim()}`);
      }
    });
}
