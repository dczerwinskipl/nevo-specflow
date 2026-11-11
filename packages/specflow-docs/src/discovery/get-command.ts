import type { Command } from 'commander';

import { getDocumentReads, getDocuments, SECTION_REFERENCE_SEPARATOR } from './documents';
import { runDocsAction, type DocsCommandContext } from '../command/context';
import type { OpenCorpus } from '../command/open-project';
import { DocsUsageError } from '../errors';

interface GetCliOptions {
  readonly content: boolean;
  readonly json: boolean;
}

export function addGetCommand(docs: Command, ctx: DocsCommandContext, open: OpenCorpus): void {
  const command = docs
    .command('get')
    .description('Resolve one or more exact active stable document ids')
    .argument(
      '<ref...>',
      'stable document ids; with --content also <id>#<sectionId> for one section of a document',
    )
    .option(
      '--content',
      'also print the Markdown of every reference in the given order: the whole document, or the section with its subsections',
      false,
    )
    .option('--json', 'emit JSON on stdout', false);

  command.action((refs: string[], opts: GetCliOptions) =>
    runDocsAction(command, async () => {
      const corpus = await open();
      if (opts.content) {
        const reads = getDocumentReads(corpus, refs);
        if (opts.json) {
          ctx.stdout(JSON.stringify(reads, null, 2));

          return;
        }

        // One delimiter line per reference, then its Markdown; a blank line between references.
        reads.forEach((read, index) => {
          if (index > 0) {
            ctx.stdout('');
          }

          const { section } = read;
          ctx.stdout(
            section === undefined
              ? `===== ${read.id} — "${read.title}" [${read.status}]  ${read.file} =====`
              : `===== ${read.id}${SECTION_REFERENCE_SEPARATOR}${section.sectionId} — "${read.title}" > ${section.headingPath.join(' > ') || '(before the first heading)'} [${read.status}]  ${read.file}:${String(section.line)} =====`,
          );
          ctx.stdout(read.content.trimEnd());
        });

        return;
      }

      const sectionRefs = refs.filter((ref) => ref.includes(SECTION_REFERENCE_SEPARATOR));
      if (sectionRefs.length > 0) {
        throw new DocsUsageError(
          `get: section references need --content: ${sectionRefs.join(', ')}`,
        );
      }

      const entries = getDocuments(corpus, refs);
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
