// `check` / `check --write`: validate the corpus and its relative links, then regenerate the index
// (when writing and the corpus is clean) or report whether the index on disk is current. Broken
// links do not block regenerating the index; they are reported either way.

import { inspectCorpus, type DocsCorpus } from '../corpus/corpus';
import { validateLinks } from '../links/links';
import { buildIndex, diffIndex, type IndexDiffOptions } from './index-file';

export interface CheckResult {
  readonly problems: string[];
  readonly wroteIndex: boolean;
  /** The generated index is missing or does not match the corpus (only known on a valid corpus). */
  readonly indexStale: boolean;
  readonly docCount: number;
}

export function checkDocumentation(
  corpus: DocsCorpus,
  { write = false, checkWriteCommand }: { write?: boolean; checkWriteCommand: string },
): CheckResult {
  const { docs, problems: corpusProblems } = inspectCorpus(corpus);
  const indexOptions: IndexDiffOptions = { root: corpus.settings.root, checkWriteCommand };

  let wroteIndex = false;
  if (write && corpusProblems.length === 0) {
    corpus.repo.writeIndex(buildIndex(docs, indexOptions));
    wroteIndex = true;
  }

  const indexProblems = corpusProblems.length
    ? []
    : diffIndex(buildIndex(docs, indexOptions), corpus.repo.readIndex(), indexOptions);
  const problems = [
    ...corpusProblems,
    ...indexProblems,
    ...validateLinks(docs, (path) => corpus.repo.pathExists(path)),
  ];

  return { problems, wroteIndex, indexStale: indexProblems.length > 0, docCount: docs.length };
}
