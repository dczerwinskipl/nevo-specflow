import type { Command } from 'commander';

import { getDocumentContents, getDocuments } from './documents';
import { runDocsAction, type DocsCommandContext } from '../command/context';
import type { OpenCorpus } from '../command/open-project';

interface GetCliOptions {
  readonly content: boolean;
  readonly json: boolean;
}

export function addGetCommand(docs: Command, ctx: DocsCommandContext, open: OpenCorpus): void {
  const command = docs
    .command('get')
    .description('Resolve one or more exact active stable document ids')
    .argument('<id...>', 'stable document ids')
    .option(
      '--content',
      'also print the full Markdown of every document, in the given order',
      false,
    )
    .option('--json', 'emit JSON on stdout', false);

  command.action((ids: string[], opts: GetCliOptions) =>
    runDocsAction(command, async () => {
      const corpus = await open();
      if (opts.content) {
        const documents = getDocumentContents(corpus, ids);
        if (opts.json) {
          ctx.stdout(JSON.stringify(documents, null, 2));

          return;
        }

        // One delimiter line per document, then the whole file; a blank line between documents.
        documents.forEach((document, index) => {
          if (index > 0) {
            ctx.stdout('');
          }

          ctx.stdout(
            `===== ${document.id} — "${document.title}" [${document.status}]  ${document.file} =====`,
          );
          ctx.stdout(document.content.trimEnd());
        });

        return;
      }

      const entries = getDocuments(corpus, ids);
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
