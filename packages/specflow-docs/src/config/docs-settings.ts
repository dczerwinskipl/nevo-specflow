// The project-owned `docs` configuration namespace (ADR 0020, architecture.runtime.configuration).
// This parser is file-free so Runtime config loading and the `docs` command share it.

import { DocsConfigError } from '../errors';
import { onlyKeys, record } from './values';

/** The `scope` / `areas` vocabularies; an absent list means the values are unrestricted. */
export interface DocsTaxonomy {
  readonly scopes?: readonly string[];
  readonly areas?: readonly string[];
}

export interface DocsSettings {
  /** Documentation root relative to the project root, `/`-separated, without a trailing slash. */
  readonly root: string;
  readonly taxonomy: DocsTaxonomy;
  /** Non-authoritative path prefixes relative to `root`, `/`-separated, without a trailing slash. */
  readonly nonAuthoritative: readonly string[];
  readonly search: DocsSearchSettings;
}

export interface DocsSearchSettings {
  /** Opt-in to hybrid (semantic) `search`; it also needs an `ai.embeddings` endpoint. */
  readonly semantic: boolean;
}

/** The defaults when the `docs` namespace or one of its keys is absent (ADR 0020 defaults table). */
export const DEFAULT_DOCS_SETTINGS: DocsSettings = {
  root: 'docs',
  taxonomy: {},
  nonAuthoritative: [],
  search: { semantic: false },
};

const DOCS_KEYS = new Set(['root', 'taxonomy', 'nonAuthoritative', 'search']);
const TAXONOMY_KEYS = new Set(['scopes', 'areas']);
const SEARCH_KEYS = new Set(['semantic']);

/**
 * A relative path below the project root (or below `docs.root`): `/`-separated, no empty, `.` or
 * `..` segments, not absolute. A single trailing slash is accepted and removed.
 */
function relativeDirectory(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DocsConfigError(`${path} must be a non-empty string.`);
  }

  const normalized = value.endsWith('/') ? value.slice(0, -1) : value;
  const segments = normalized.split('/');
  if (
    normalized.includes('\\') ||
    /^[A-Za-z]:/.test(normalized) ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new DocsConfigError(
      `${path} must be a relative directory path with '/' separators and no '.' or '..' segments (got '${value}').`,
    );
  }

  return normalized;
}

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

/** Parse the `docs` namespace of the project configuration; `undefined` means all defaults. */
export function parseDocsConfig(value: unknown): DocsSettings {
  if (value === undefined) {
    return DEFAULT_DOCS_SETTINGS;
  }

  const docs = record(value, 'docs');
  onlyKeys(docs, DOCS_KEYS, 'docs');

  const root =
    docs.root === undefined
      ? DEFAULT_DOCS_SETTINGS.root
      : relativeDirectory(docs.root, 'docs.root');

  let taxonomy: DocsTaxonomy = {};
  if (docs.taxonomy !== undefined) {
    const declared = record(docs.taxonomy, 'docs.taxonomy');
    onlyKeys(declared, TAXONOMY_KEYS, 'docs.taxonomy');
    taxonomy = {
      ...(declared.scopes === undefined
        ? {}
        : { scopes: vocabulary(declared.scopes, 'docs.taxonomy.scopes') }),
      ...(declared.areas === undefined
        ? {}
        : { areas: vocabulary(declared.areas, 'docs.taxonomy.areas') }),
    };
  }

  let nonAuthoritative: readonly string[] = DEFAULT_DOCS_SETTINGS.nonAuthoritative;
  if (docs.nonAuthoritative !== undefined) {
    if (!Array.isArray(docs.nonAuthoritative)) {
      throw new DocsConfigError('docs.nonAuthoritative must be a list of path prefixes.');
    }

    nonAuthoritative = docs.nonAuthoritative.map((entry, i) =>
      relativeDirectory(entry, `docs.nonAuthoritative[${String(i)}]`),
    );
  }

  let search = DEFAULT_DOCS_SETTINGS.search;
  if (docs.search !== undefined) {
    const declared = record(docs.search, 'docs.search');
    onlyKeys(declared, SEARCH_KEYS, 'docs.search');
    if (declared.semantic !== undefined && typeof declared.semantic !== 'boolean') {
      throw new DocsConfigError('docs.search.semantic must be true or false.');
    }

    search = { semantic: declared.semantic === true };
  }

  return { root, taxonomy, nonAuthoritative, search };
}

/**
 * Whether a project-root-relative document path lies under one of the non-authoritative prefixes.
 * Prefixes name directories, so `ideas` matches `docs/ideas/x.md` but not `docs/ideas-x.md`.
 */
export function isNonAuthoritative(settings: DocsSettings, file: string): boolean {
  const rootPrefix = `${settings.root}/`;
  if (!file.startsWith(rootPrefix)) {
    return false;
  }

  const underRoot = file.slice(rootPrefix.length);

  return settings.nonAuthoritative.some((prefix) => underRoot.startsWith(`${prefix}/`));
}
