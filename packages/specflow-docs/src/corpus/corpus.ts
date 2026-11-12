// A documentation corpus: the repository, its settings (`docs.root` and `<docs.root>/docs.yaml`)
// and host-specific extra rules, scanned and validated together.

import { statSync } from 'node:fs';
import { join } from 'node:path';

import type { CorpusSettings } from '../config/docs-file';
import type { DocsSettings } from '../config/docs-settings';
import { loadDocsFile } from '../config/load-docs-settings';
import type { DocRecord } from '../frontmatter/contract';
import { validateCorpus, validateDoc } from '../frontmatter/validate';
import { DocsConfigError } from '../errors';
import { createFileSystemDocRepository, type DocRepository, type ScanResult } from './repository';

/**
 * Rules a host adds on top of the product contract, for example repository-only checks of a
 * repository's own tooling (ADR 0020). The product shell supplies none.
 */
export interface DocsCorpusRules {
  /**
   * Extra problems over the scanned documents; reported like contract problems by `check` only.
   * Reads (`list`, `find`, `get`, `context`, `search`) skip documents by the product contract and
   * never run these rules.
   */
  readonly validate?: (docs: readonly DocRecord[]) => string[];
}

export interface DocsCorpus {
  readonly repo: DocRepository;
  readonly settings: CorpusSettings;
  readonly validate?: DocsCorpusRules['validate'];
}

/**
 * Open the corpus under `docs.root` and read its `docs.yaml`. A root that is not an existing
 * directory and an invalid `docs.yaml` are configuration errors.
 */
export function openFileSystemCorpus(
  projectRoot: string,
  { root }: DocsSettings,
  rules: DocsCorpusRules = {},
): DocsCorpus {
  if (
    !statSync(join(projectRoot, ...root.split('/')), {
      throwIfNoEntry: false,
    })?.isDirectory()
  ) {
    throw new DocsConfigError(
      `documentation root '${root}' does not exist in ${projectRoot}; create it or set docs.root.`,
    );
  }

  const settings: CorpusSettings = { root, ...loadDocsFile(projectRoot, root) };

  return {
    repo: createFileSystemDocRepository({
      projectRoot,
      root: settings.root,
      exclude: settings.exclude,
    }),
    settings,
    ...(rules.validate ? { validate: rules.validate } : {}),
  };
}

export function collectCorpusProblems(
  scan: ScanResult,
  settings: CorpusSettings,
  validate?: DocsCorpusRules['validate'],
): string[] {
  const problems: string[] = [];
  for (const file of scan.missingFrontmatter) {
    problems.push(
      `${file}: missing frontmatter (every authored ${settings.root}/**.md file needs it)`,
    );
  }

  for (const { error } of scan.invalidFrontmatter) {
    problems.push(error);
  }

  for (const doc of scan.docs) {
    problems.push(...validateDoc(doc, settings.taxonomy));
  }

  problems.push(...validateCorpus(scan.docs));
  problems.push(...(validate?.(scan.docs) ?? []));

  return problems;
}

/** Scan and validate, returning the problems instead of throwing. */
export function inspectCorpus(corpus: DocsCorpus): { docs: DocRecord[]; problems: string[] } {
  const scan = corpus.repo.scan();

  return {
    docs: scan.docs,
    problems: collectCorpusProblems(scan, corpus.settings, corpus.validate),
  };
}
