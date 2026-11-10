import type { Command } from 'commander';

import { getDocumentContents, getDocuments, getDocumentSections } from './documents';
import { runDocsAction, type DocsCommandContext } from '../command/context';
import type { OpenCorpus } from '../command/open-project';
import { DocsUsageError } from '../errors';

interface GetCliOptions {
  readonly content: boolean;
  readonly section: string[];
  readonly json: boolean;
}

const collect = (value: string, previous: string[]): string[] => [...previous, value];

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
    .option(
      '--section <sectionId>',
      'print only this section of the one given document, with its subsections (repeatable; ids as `search` reports them)',
      collect,
      [],
    )
    .option('--json', 'emit JSON on stdout', false);

  command.action((ids: string[], opts: GetCliOptions) =>
    runDocsAction(command, async () => {
      if (opts.section.length > 0) {
        if (opts.content) {
          throw new DocsUsageError('get: --section and --content cannot be combined');
        }

        if (ids.length !== 1) {
          throw new DocsUsageError('get: --section reads sections of exactly one document id');
        }

        const document = getDocumentSections(await open(), ids[0]!, opts.section);
        if (opts.json) {
          ctx.stdout(JSON.stringify(document, null, 2));

          return;
        }

        // The document delimiter line, then per section a delimiter with its heading path, id and
        // line, then its Markdown; a blank line between sections.
        ctx.stdout(
          `===== ${document.id} — "${document.title}" [${document.status}]  ${document.file} =====`,
        );
        document.sections.forEach((section, index) => {
          if (index > 0) {
            ctx.stdout('');
          }

          ctx.stdout(
            `----- ${section.headingPath.join(' > ') || '(top)'}  [${section.sectionId}, line ${String(section.line)}] -----`,
          );
          ctx.stdout(section.content);
        });

        return;
      }

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
