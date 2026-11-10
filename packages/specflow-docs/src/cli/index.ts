// `./cli` boundary of @nevo/specflow-docs: the Commander adapter the product shell mounts as
// `nevo-specflow docs`. Output, error and exit conventions follow the shell: results on stdout,
// diagnostics on stderr, usage errors as Commander errors (exit 2), other failures thrown (exit 1).

import { Command } from 'commander';

import { addContextCommand } from '../discovery/context-command';
import { addFindCommand } from '../discovery/find-command';
import { addGetCommand } from '../discovery/get-command';
import { addListCommand } from '../discovery/list-command';
import { addSearchCommand } from '../semantic/search-command';
import { addSemanticCommand } from '../semantic/semantic-command';
import { addCheckCommand } from '../validation/check-command';
import type { DocsCommandContext } from './context';
import { corpusOpener, projectOpener } from './open-corpus';

export type { DocsCommandContext, DocsProject } from './context';

export function createDocsCommand(ctx: DocsCommandContext): Command {
  const docs = new Command('docs')
    .description('Discover, search, validate and index the project documentation')
    // Set before the subcommands are created so they inherit it.
    .configureOutput({
      writeOut: (str) => ctx.stdout(str.replace(/\n$/, '')),
      writeErr: (str) => ctx.stderr(str.replace(/\n$/, '')),
    });

  const openProject = projectOpener(ctx);
  const open = corpusOpener(openProject);
  addListCommand(docs, ctx, open);
  addFindCommand(docs, ctx, open);
  addGetCommand(docs, ctx, open);
  addContextCommand(docs, ctx, open);
  addCheckCommand(docs, ctx, open);
  addSearchCommand(docs, ctx, openProject);
  addSemanticCommand(docs, ctx, openProject);

  return docs;
}
