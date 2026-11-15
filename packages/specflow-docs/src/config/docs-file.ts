// The documentation settings file `<docs.root>/docs.yaml` (ADR 0020): the taxonomy and the path
// prefixes describe the documentation, so they live next to it, not in `.nevo/config.yaml`. The file
// is optional (absent: unrestricted taxonomy, no prefixes) and is not part of the corpus: only
// `*.md` files are scanned. This parser is file-free; `loadDocsFile` reads the file.

import { DocsConfigError } from '../errors';
import { onlyKeys, record, relativeDirectory } from './values';

export const DOCS_FILE_NAME = 'docs.yaml';

/** The `scope` / `areas` vocabularies; an absent list means the values are unrestricted. */
export interface DocsTaxonomy {
  readonly scopes?: readonly string[];
  readonly areas?: readonly string[];
}

export interface DocsFileSettings {
  readonly taxonomy: DocsTaxonomy;
  /** Proposal path prefixes relative to `docs.root`, `/`-separated, no trailing slash. */
  readonly proposals: readonly string[];
  /**
   * Excluded path prefixes relative to `docs.root`, `/`-separated, without a trailing slash: files
   * below them are not part of the corpus and are not scanned. Links into them still resolve.
   */
  readonly exclude: readonly string[];
}

/** What a corpus works with: its root and the settings of its `docs.yaml`. */
export interface CorpusSettings extends DocsFileSettings {
  /** `docs.root` of the project configuration. */
  readonly root: string;
}

/** The defaults when `docs.yaml` or one of its keys is absent (ADR 0020 defaults table). */
export const DEFAULT_DOCS_FILE_SETTINGS: DocsFileSettings = {
  taxonomy: {},
  proposals: [],
  exclude: [],
};

const FILE_KEYS = new Set(['taxonomy', 'proposals', 'exclude']);
const TAXONOMY_KEYS = new Set(['scopes', 'areas']);

function vocabulary(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new DocsConfigError(`${path} must be a non-empty list of strings.`);
  }

  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim() === '' || entry !== entry.trim()) {
      throw new DocsConfigError(
        `${path} entries must be non-empty strings without surrounding spaces.`,
      );
    }

    if (seen.has(entry)) {
      throw new DocsConfigError(`${path} lists '${entry}' more than once.`);
    }

    seen.add(entry);
  }

  return [...seen];
}

/** A list of directory prefixes relative to `docs.root`; `undefined` means none. */
function prefixList(value: unknown, path: string): readonly string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new DocsConfigError(`${path} must be a list of path prefixes.`);
  }

  return value.map((entry, i) => relativeDirectory(entry, `${path}[${String(i)}]`));
}

/** Parse the top level of `docs.yaml`; `undefined` (no file, or an empty one) means all defaults. */
export function parseDocsFile(value: unknown): DocsFileSettings {
  if (value === undefined) {
    return DEFAULT_DOCS_FILE_SETTINGS;
  }

  const file = record(value, 'docs.yaml');
  for (const key of Object.keys(file)) {
    if (!FILE_KEYS.has(key)) {
      throw new DocsConfigError(`Unknown configuration key '${key}'.`);
    }
  }

  let taxonomy: DocsTaxonomy = {};
  if (file.taxonomy !== undefined) {
    const declared = record(file.taxonomy, 'taxonomy');
    onlyKeys(declared, TAXONOMY_KEYS, 'taxonomy');
    taxonomy = {
      ...(declared.scopes === undefined
        ? {}
        : { scopes: vocabulary(declared.scopes, 'taxonomy.scopes') }),
      ...(declared.areas === undefined
        ? {}
        : { areas: vocabulary(declared.areas, 'taxonomy.areas') }),
    };
  }

  return {
    taxonomy,
    proposals: prefixList(file.proposals, 'proposals'),
    exclude: prefixList(file.exclude, 'exclude'),
  };
}

/**
 * Whether a project-root-relative document path lies under one of the proposal prefixes.
 * Prefixes name directories, so `ideas` matches `docs/ideas/x.md` but not `docs/ideas-x.md`.
 */
export function isProposal(settings: CorpusSettings, file: string): boolean {
  const rootPrefix = `${settings.root}/`;
  if (!file.startsWith(rootPrefix)) {
    return false;
  }

  const underRoot = file.slice(rootPrefix.length);

  return settings.proposals.some((prefix) => underRoot.startsWith(`${prefix}/`));
}
