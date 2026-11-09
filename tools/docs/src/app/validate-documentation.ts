import { buildIndex, diffIndex } from '../domain/index-file.js';
import { validateLinks } from '../domain/links.js';
import type { DocRepository } from '../ports.js';
import { inspectCorpus } from './load-corpus.js';

export interface ValidateResult {
  readonly problems: string[];
  readonly wroteIndex: boolean;
  /** The generated index is missing or does not match the corpus (only known on a valid corpus). */
  readonly indexStale: boolean;
  readonly docCount: number;
}

/**
 * `check` / `check --write` — validate the corpus and its relative links, then either regenerate
 * the index (when `write` and the corpus is clean) or report its staleness. Broken links do not
 * block regenerating the index; they are reported either way.
 */
export function validateDocumentation(
  repo: DocRepository,
  { write = false }: { write?: boolean } = {},
): ValidateResult {
  const { docs, problems: corpusProblems } = inspectCorpus(repo);

  let wroteIndex = false;
  if (write && corpusProblems.length === 0) {
    repo.writeIndex(buildIndex(docs));
    wroteIndex = true;
  }

  const indexProblems = corpusProblems.length ? [] : diffIndex(buildIndex(docs), repo.readIndex());
  const problems = [
    ...corpusProblems,
    ...indexProblems,
    ...validateLinks(docs, (path) => repo.pathExists(path)),
  ];

  return { problems, wroteIndex, indexStale: indexProblems.length > 0, docCount: docs.length };
}
