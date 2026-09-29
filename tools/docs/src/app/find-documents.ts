import { asString, INACTIVE_STATUSES, type DocRecord } from '../domain/frontmatter.js';
import { searchDocs, type ScoredDoc } from '../domain/search.js';
import { UsageError } from '../errors.js';
import type { DocRepository } from '../ports.js';
import { loadValidatedCorpus } from './load-corpus.js';

export interface FindOptions {
  readonly query?: string;
  readonly type?: string;
  readonly status?: string;
  readonly scope?: string;
  readonly area?: string;
  readonly tag?: string;
  readonly limit?: number;
}

/** `list` / `find` — every status is visible; status filtering is opt-in. */
export function findDocuments(repo: DocRepository, opts: FindOptions): (DocRecord | ScoredDoc)[] {
  return searchDocs(loadValidatedCorpus(repo), opts);
}

export interface ContextEntry {
  readonly id: string;
  readonly file: string;
  readonly title: string;
  readonly summary: string;
  readonly read_when: string[];
  readonly scope?: string;
  readonly areas: string[];
  readonly tags: string[];
}

function contextEntry(d: DocRecord): ContextEntry {
  return {
    id: asString(d.id),
    file: d.file,
    title: asString(d.title),
    summary: typeof d.summary === 'string' ? d.summary : '',
    read_when: Array.isArray(d.read_when) ? d.read_when.map((x) => asString(x)) : [],
    ...(typeof d.scope === 'string' ? { scope: d.scope } : {}),
    areas: Array.isArray(d.areas) ? d.areas.map((x) => asString(x)) : [],
    tags: Array.isArray(d.tags) ? d.tags.map((x) => asString(x)) : [],
  };
}

/** Resolve exact stable ids in caller-provided order. */
export function getDocuments(repo: DocRepository, ids: readonly string[]): ContextEntry[] {
  const docs = loadValidatedCorpus(repo);
  const byId = new Map(docs.map((doc) => [asString(doc.id), doc]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) throw new UsageError(`get: unknown document id(s): ${missing.join(', ')}`);
  return ids.map((id) => contextEntry(byId.get(id)!));
}

/**
 * `context` — the files an agent should load for a task. Deprecated/superseded
 * documents are never recommended; once excluded, a replacement ranks first.
 */
export function getContext(
  repo: DocRepository,
  { query, limit = 5 }: { query: string; limit?: number },
): ContextEntry[] {
  const results = searchDocs(loadValidatedCorpus(repo), {
    query,
    limit,
    excludeStatuses: INACTIVE_STATUSES,
  });
  return results.map(contextEntry);
}
