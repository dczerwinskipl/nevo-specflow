import type { Command } from 'commander';

import { DocsError } from '../errors';
import { checkDocumentation } from './check';
import { runDocsAction, type DocsCommandContext } from '../command/context';
import type { OpenCorpus } from '../command/open-project';

export function addCheckCommand(docs: Command, ctx: DocsCommandContext, open: OpenCorpus): void {
  const command = docs
    .command('check')
    .description(
      'Validate the corpus and its relative links, and verify (or regenerate) the generated index',
    )
    .option('--write', 'regenerate index.generated.{md,json} when the corpus is clean', false);

  command.action((opts: { write: boolean }) =>
    runDocsAction(command, async () => {
      const corpus = await open();
      const result = checkDocumentation(corpus, {
        write: opts.write,
        checkWriteCommand: ctx.checkWriteCommand,
      });
      if (result.wroteIndex) {
        const root = corpus.settings.root;
        ctx.stdout(`Wrote ${root}/index.generated.json and ${root}/index.generated.md`);
      }

      if (result.problems.length) {
        for (const p of result.problems) {
          ctx.stderr(p);
        }

        if (result.indexStale) {
          ctx.stderr(`Run \`${ctx.checkWriteCommand}\` to regenerate the index.`);
        }

        throw new DocsError(
          `documentation check failed (${String(result.problems.length)} problem${
            result.problems.length === 1 ? '' : 's'
          })`,
        );
      }

      ctx.stdout(`OK — ${String(result.docCount)} documents, corpus valid, index current.`);
    }),
  );
}
