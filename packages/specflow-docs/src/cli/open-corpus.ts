import { loadDocsSettings } from '../config/load-docs-settings';
import { openFileSystemCorpus, type DocsCorpus } from '../corpus/corpus';
import type { DocsCommandContext } from './context';

export type OpenCorpus = () => Promise<DocsCorpus>;

/** Resolve the project, read its `docs` settings and open its corpus for one command run. */
export function corpusOpener(ctx: DocsCommandContext): OpenCorpus {
  return async () => {
    const project = await ctx.resolveProject();

    return openFileSystemCorpus(project.root, loadDocsSettings(project), ctx.corpusRules);
  };
}
