// A documentation corpus: the repository, the project settings and host-specific extra rules,
// scanned and validated together.

import { statSync } from 'node:fs';
import { join } from 'node:path';

import type { DocsSettings } from '../config/docs-settings';
import type { DocRecord } from '../frontmatter/contract';
import { validateCorpus, validateDoc } from '../frontmatter/validate';
import { DocsConfigError, DocsCorpusInvalidError } from '../errors';
import { createFileSystemDocRepository, type DocRepository, type ScanResult } from './repository';

/**
 * Rules a host adds on top of the product contract, for example repository-only checks of a
 * repository's own tooling (ADR 0020). The product shell supplies none.
 */
export interface DocsCorpusRules {
  /**
   * Extra problems over the scanned documents; reported like contract problems. `search` validates
   * frontmatter only: the records it passes here have an empty `body`.
   */
  readonly validate?: (docs: readonly DocRecord[]) => string[];
}

export interface DocsCorpus {
  readonly repo: DocRepository;
  readonly settings: DocsSettings;
  readonly validate?: DocsCorpusRules['validate'];
}

/** Open the corpus under `docs.root`; a root that is not an existing directory is a configuration error. */
export function openFileSystemCorpus(
  projectRoot: string,
  settings: DocsSettings,
  rules: DocsCorpusRules = {},
): DocsCorpus {
  if (
    !statSync(join(projectRoot, ...settings.root.split('/')), {
      throwIfNoEntry: false,
    })?.isDirectory()
  ) {
    throw new DocsConfigError(
      `documentation root '${settings.root}' does not exist in ${projectRoot}; create it or set docs.root.`,
    );
  }

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
  settings: DocsSettings,
  validate?: DocsCorpusRules['validate'],
): string[] {
  const problems: string[] = [];
  for (const file of scan.missingFrontmatter) {
    problems.push(
      `${file}: missing frontmatter (every authored ${settings.root}/**.md file needs it)`,
    );
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

/** Scan and fully validate; throws `DocsCorpusInvalidError` on any inconsistency. */
export function loadValidatedCorpus(corpus: DocsCorpus): DocRecord[] {
  const { docs, problems } = inspectCorpus(corpus);
  if (problems.length) {
    throw new DocsCorpusInvalidError(problems);
  }

  return docs;
}
