// A documentation corpus: the repository, the project settings and host-specific extra rules,
// scanned and validated together.

import type { DocsSettings } from '../config/docs-settings';
import type { DocRecord } from '../frontmatter/contract';
import { validateCorpus, validateDoc } from '../frontmatter/validate';
import { DocsCorpusInvalidError } from '../errors';
import { createFileSystemDocRepository, type DocRepository, type ScanResult } from './repository';

/**
 * Rules a host adds on top of the product contract, for example repository-only checks of a
 * repository's own tooling (ADR 0020). The product shell supplies none.
 */
export interface DocsCorpusRules {
  /** Exempt a markdown file (path relative to the documentation root) from needing frontmatter. */
  readonly isFrontmatterExempt?: (pathUnderRoot: string) => boolean;
  /** Extra problems over the scanned documents; reported like contract problems. */
  readonly validate?: (docs: readonly DocRecord[]) => string[];
}

export interface DocsCorpus {
  readonly repo: DocRepository;
  readonly settings: DocsSettings;
  readonly validate?: DocsCorpusRules['validate'];
}

export function openFileSystemCorpus(
  projectRoot: string,
  settings: DocsSettings,
  rules: DocsCorpusRules = {},
): DocsCorpus {
  return {
    repo: createFileSystemDocRepository({
      projectRoot,
      root: settings.root,
      ...(rules.isFrontmatterExempt ? { isFrontmatterExempt: rules.isFrontmatterExempt } : {}),
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
