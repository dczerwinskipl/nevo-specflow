import type { DocsConfiguration } from '../config/docs-configuration';
import { loadDocsSettings } from '../config/load-docs-settings';
import { openFileSystemCorpus, type DocsCorpus } from '../corpus/corpus';
import type { DocsCommandContext, DocsProject } from './context';

export interface OpenedProject {
  readonly project: DocsProject;
  readonly configuration: DocsConfiguration;
  readonly corpus: DocsCorpus;
}

export type OpenProject = () => Promise<OpenedProject>;
export type OpenCorpus = () => Promise<DocsCorpus>;

/** Resolve the project, read and validate its configuration and open its corpus for one run. */
export function projectOpener(ctx: DocsCommandContext): OpenProject {
  return async () => {
    const project = await ctx.resolveProject();
    const configuration = loadDocsSettings(project);

    return {
      project,
      configuration,
      corpus: openFileSystemCorpus(project.root, configuration.docs, ctx.corpusRules),
    };
  };
}

export function corpusOpener(open: OpenProject): OpenCorpus {
  return async () => (await open()).corpus;
}
