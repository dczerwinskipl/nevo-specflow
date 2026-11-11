import {
  buildIndex,
  DocsCorpusInvalidError,
  inspectCorpus,
  type DocsCorpus,
} from '@nevo/specflow-docs';

import { ADR_DIRECTORY, planNewAdr, type AdrPlan } from '../domain/adr.js';

/** The ADR writes `adr new` needs beyond the product's read-only corpus port. */
export interface AdrFiles {
  /** Basenames of the `*.md` files in the ADR directory. */
  filenames(): string[];
  /** Write a file (project-root-relative path, `/` separators). */
  write(file: string, content: string): void;
  remove(file: string): void;
}

export interface CreateAdrInput {
  readonly title: string;
  readonly date?: string;
  readonly dryRun?: boolean;
}

export interface CreateAdrResult {
  readonly plan: AdrPlan;
  readonly written: boolean;
  readonly indexRegenerated: boolean;
}

/**
 * Create the next-numbered ADR as a `draft`. Transactional:
 *   1. refuse if the current corpus is already invalid;
 *   2. plan + render + validate the file in memory (planNewAdr);
 *   3. write the file;
 *   4. re-validate — on any problem, remove the file and throw (no half-apply);
 *   5. regenerate the deterministic index.
 */
export function createAdr(
  corpus: DocsCorpus,
  files: AdrFiles,
  input: CreateAdrInput,
): CreateAdrResult {
  const before = inspectCorpus(corpus);
  if (before.problems.length) {
    throw new DocsCorpusInvalidError(before.problems);
  }

  const plan = planNewAdr({
    title: input.title,
    directory: `${corpus.settings.root}/${ADR_DIRECTORY}`,
    filenames: files.filenames(),
    ...(input.date === undefined ? {} : { date: input.date }),
  });

  if (input.dryRun) {
    return { plan, written: false, indexRegenerated: false };
  }

  files.write(plan.file, plan.content);

  const after = inspectCorpus(corpus);
  if (after.problems.length) {
    files.remove(plan.file);

    throw new DocsCorpusInvalidError(after.problems);
  }

  corpus.repo.writeIndex(buildIndex(after.docs, { root: corpus.settings.root }));

  return { plan, written: true, indexRegenerated: true };
}
