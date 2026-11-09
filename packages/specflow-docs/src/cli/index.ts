// `./cli` boundary of @nevo/specflow-docs: the Commander adapter the product shell mounts as
// `nevo-specflow docs`. Output, error and exit conventions follow the shell: results on stdout,
// diagnostics on stderr, usage errors as Commander errors (exit 2), other failures thrown (exit 1).

import { Command } from 'commander';

import { addCheckCommand } from './commands/check';
import { addContextCommand } from './commands/context';
import { addFindCommand } from './commands/find';
import { addGetCommand } from './commands/get';
import { addListCommand } from './commands/list';
import type { DocsCommandContext } from './context';
import { corpusOpener } from './open-corpus';

export type { DocsCommandContext, DocsProject } from './context';

export function createDocsCommand(ctx: DocsCommandContext): Command {
  const docs = new Command('docs')
    .description('Discover, validate and index the project documentation')
    // Set before the subcommands are created so they inherit it.
    .configureOutput({
      writeOut: (str) => ctx.stdout(str.replace(/\n$/, '')),
      writeErr: (str) => ctx.stderr(str.replace(/\n$/, '')),
    });

  const open = corpusOpener(ctx);
  addListCommand(docs, ctx, open);
  addFindCommand(docs, ctx, open);
  addGetCommand(docs, ctx, open);
  addContextCommand(docs, ctx, open);
  addCheckCommand(docs, ctx, open);

  return docs;
}
