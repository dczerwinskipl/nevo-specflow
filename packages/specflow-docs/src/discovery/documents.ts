// `list` / `find` / `get` / `context` over a validated corpus.

import { splitMarkdownSections } from '@nevo/ai-semantic-search';

import { isNonAuthoritative } from '../config/docs-file';
import { loadValidatedCorpus, type DocsCorpus } from '../corpus/corpus';
import {
  asString,
  INACTIVE_STATUSES,
  isInactiveStatus,
  parseFrontmatter,
  type DocRecord,
} from '../frontmatter/contract';
import { DocsUsageError } from '../errors';
import { searchDocs, type ScoredDoc } from '../frontmatter/frontmatter-search';

export interface FindOptions {
  readonly query?: string;
  readonly type?: string;
  readonly status?: string;
  readonly scope?: string;
  readonly area?: string;
  readonly tag?: string;
  readonly limit?: number;
}

/** `list` / `find`: every status and every path is visible; filtering is opt-in. */
export function findDocuments(corpus: DocsCorpus, opts: FindOptions): (DocRecord | ScoredDoc)[] {
  return searchDocs(loadValidatedCorpus(corpus), opts);
}

export interface ContextEntry {
  readonly id: string;
  readonly file: string;
  readonly title: string;
  readonly status: string;
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
    status: asString(d.status),
    summary: typeof d.summary === 'string' ? d.summary : '',
    read_when: Array.isArray(d.read_when) ? d.read_when.map((x) => asString(x)) : [],
    ...(typeof d.scope === 'string' ? { scope: d.scope } : {}),
    areas: Array.isArray(d.areas) ? d.areas.map((x) => asString(x)) : [],
    tags: Array.isArray(d.tags) ? d.tags.map((x) => asString(x)) : [],
  };
}

function inactiveDocumentDescription(doc: DocRecord): string {
  const id = asString(doc.id);
  const status = asString(doc.status);
  const replacement =
    typeof doc.superseded_by === 'string' && doc.superseded_by
      ? `; use '${doc.superseded_by}' instead`
      : '';

  return `'${id}' (${status}${replacement})`;
}

/** Resolve exact stable ids in caller order; fails closed on unknown or inactive documents. */
export function getDocuments(corpus: DocsCorpus, ids: readonly string[]): ContextEntry[] {
  const docs = loadValidatedCorpus(corpus);
  const byId = new Map(docs.map((doc) => [asString(doc.id), doc]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) {
    throw new DocsUsageError(`get: unknown document id(s): ${missing.join(', ')}`);
  }

  const inactive = ids.map((id) => byId.get(id)!).filter((doc) => isInactiveStatus(doc.status));
  if (inactive.length) {
    throw new DocsUsageError(
      `get: inactive document id(s): ${inactive.map(inactiveDocumentDescription).join(', ')}`,
    );
  }

  return ids.map((id) => contextEntry(byId.get(id)!));
}

export interface DocumentContent extends ContextEntry {
  /** The whole Markdown file, frontmatter included. */
  readonly content: string;
}

/** `get --content`: `getDocuments` (same order, same fail-closed rules) with each file's content. */
export function getDocumentContents(corpus: DocsCorpus, ids: readonly string[]): DocumentContent[] {
  return getDocuments(corpus, ids).map((entry) => ({
    ...entry,
    content: corpus.repo.readMarkdownFile(entry.file),
  }));
}

export interface DocumentSection {
  /** The section id `docs search` reports (`sections[].sectionId`). */
  readonly sectionId: string;
  readonly headingPath: string[];
  /** 1-based line of the section's heading in the file. */
  readonly line: number;
  /** The section's Markdown from its heading line, its subsections included. */
  readonly content: string;
}

export interface DocumentSections extends ContextEntry {
  readonly sections: DocumentSection[];
}

/**
 * `get <id> --section <sectionId>...`: `getDocuments` for one id (same fail-closed rules) with the
 * requested sections in the given order. A section reaches from its heading to the next heading of
 * the same or a higher level, so it includes its subsections; `_top` is the text before the first
 * heading. Fails closed when a section id is not one of the document's (it names the valid ones).
 */
export function getDocumentSections(
  corpus: DocsCorpus,
  id: string,
  sectionIds: readonly string[],
): DocumentSections {
  const [entry] = getDocuments(corpus, [id]);
  const parsed = parseFrontmatter(corpus.repo.readMarkdownFile(entry!.file), entry!.file)!;
  const lines = parsed.body.replace(/\r\n?/gu, '\n').split('\n');
  const sections = splitMarkdownSections(parsed.body);
  const byId = new Map(sections.map((section, index) => [section.id, index]));
  const unknown = sectionIds.filter((sectionId) => !byId.has(sectionId));
  if (unknown.length > 0) {
    throw new DocsUsageError(
      `get: unknown section id(s) in '${id}': ${unknown.join(', ')} (sections: ${sections.map((section) => section.id).join(', ')})`,
    );
  }

  return {
    ...entry!,
    sections: sectionIds.map((sectionId) => {
      const index = byId.get(sectionId)!;
      const section = sections[index]!;
      const depth = section.headingPath.length;
      const next = sections
        .slice(index + 1)
        .find((other) => depth === 0 || other.headingPath.length <= depth);
      const end = next === undefined ? lines.length : next.startLine - 1;

      return {
        sectionId,
        headingPath: [...section.headingPath],
        line: parsed.bodyLine + section.startLine - 1,
        content: lines
          .slice(section.startLine - 1, end)
          .join('\n')
          .trimEnd(),
      };
    }),
  };
}

/**
 * `context`: the authoritative, current working context to load for a task. Inactive documents and
 * documents under the project's non-authoritative prefixes are never recommended; they stay
 * reachable through explicit `find` / `get`.
 */
export function getContext(
  corpus: DocsCorpus,
  { query, limit }: { query: string; limit?: number },
): ContextEntry[] {
  const contextCorpus = loadValidatedCorpus(corpus).filter(
    (doc) => !isNonAuthoritative(corpus.settings, doc.file),
  );
  const results = searchDocs(contextCorpus, {
    query,
    ...(limit === undefined ? {} : { limit }),
    excludeStatuses: INACTIVE_STATUSES,
  });

  return results.map(contextEntry);
}
