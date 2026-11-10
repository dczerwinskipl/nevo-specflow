// The project-owned `docs` configuration namespace of `.nevo/config.yaml` (ADR 0020,
// architecture.runtime.configuration): where the documentation lives and the semantic-search
// opt-in. What describes the documentation itself (taxonomy, path prefixes) is in `docs.yaml` next
// to it (`docs-file.ts`). This parser is file-free so Runtime config loading and the `docs` command
// share it.

import { DocsConfigError } from '../errors';
import { DOCS_FILE_NAME } from './docs-file';
import { onlyKeys, record, relativeDirectory } from './values';

export interface DocsSettings {
  /** Documentation root relative to the project root, `/`-separated, without a trailing slash. */
  readonly root: string;
  readonly search: DocsSearchSettings;
}

export interface DocsSearchSettings {
  /** Opt-in to hybrid (semantic) `search`; it also needs an `ai.embeddings` endpoint. */
  readonly semantic: boolean;
}

/** The defaults when the `docs` namespace or one of its keys is absent (ADR 0020 defaults table). */
export const DEFAULT_DOCS_SETTINGS: DocsSettings = {
  root: 'docs',
  search: { semantic: false },
};

const DOCS_KEYS = new Set(['root', 'search']);
const SEARCH_KEYS = new Set(['semantic']);
/** Keys of `<docs.root>/docs.yaml`; named explicitly so the error says where they go. */
const DOCS_FILE_KEYS = ['taxonomy', 'nonAuthoritative', 'exclude'] as const;

/** Parse the `docs` namespace of the project configuration; `undefined` means all defaults. */
export function parseDocsConfig(value: unknown): DocsSettings {
  if (value === undefined) {
    return DEFAULT_DOCS_SETTINGS;
  }

  const docs = record(value, 'docs');
  const root =
    docs.root === undefined
      ? DEFAULT_DOCS_SETTINGS.root
      : relativeDirectory(docs.root, 'docs.root');
  for (const key of DOCS_FILE_KEYS) {
    if (key in docs) {
      throw new DocsConfigError(
        `docs.${key} is not a project configuration key; set '${key}' in ${root}/${DOCS_FILE_NAME}, the documentation settings file next to the documentation.`,
      );
    }
  }

  onlyKeys(docs, DOCS_KEYS, 'docs');

  let search = DEFAULT_DOCS_SETTINGS.search;
  if (docs.search !== undefined) {
    const declared = record(docs.search, 'docs.search');
    onlyKeys(declared, SEARCH_KEYS, 'docs.search');
    if (declared.semantic !== undefined && typeof declared.semantic !== 'boolean') {
      throw new DocsConfigError('docs.search.semantic must be true or false.');
    }

    search = { semantic: declared.semantic === true };
  }

  return { root, search };
}
