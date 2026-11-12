// `list` / `find` / `get` / `context` over a validated corpus.

import { splitMarkdownSections, type MarkdownSection } from '@nevo/ai-semantic-search';

import { isNonAuthoritative } from '../config/docs-file';
import type { DocsCorpus } from '../corpus/corpus';
import { loadReadableDocs, type SkippedDocument } from '../corpus/readable';
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
export function findDocuments(
  corpus: DocsCorpus,
  opts: FindOptions,
): Skipping<DocRecord | ScoredDoc> {
  const { docs, skipped } = loadReadableDocs(corpus);

  return { documents: searchDocs(docs, opts), skipped };
}

/** The result of a read over the readable documents, with the documents it left out. */
export interface Skipping<T> {
  readonly documents: T[];
  readonly skipped: SkippedDocument[];
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

/** Resolve exact stable ids in caller order; fails closed on skipped, unknown or inactive documents (one error names all of them). */
export function getDocuments(corpus: DocsCorpus, ids: readonly string[]): Skipping<ContextEntry> {
  const { docs, skipped, skippedById } = loadReadableDocs(corpus);
  const byId = new Map(docs.map((doc) => [asString(doc.id), doc]));
  const problems: string[] = [];
  const unreadable = ids.filter((id) => skippedById.has(id));
  if (unreadable.length) {
    const reasons = unreadable.flatMap((id) =>
      skippedById.get(id)!.map(({ path, error }) => `'${id}' skipped in ${path}: ${error}`),
    );
    problems.push(`skipped document id(s): ${reasons.join('; ')}`);
  }

  const missing = ids.filter((id) => !byId.has(id) && !skippedById.has(id));
  if (missing.length) {
    problems.push(`unknown document id(s): ${missing.join(', ')}`);
  }

  const inactive = ids
    .flatMap((id) => byId.get(id) ?? [])
    .filter((doc) => isInactiveStatus(doc.status));
  if (inactive.length) {
    problems.push(
      `inactive document id(s): ${inactive.map(inactiveDocumentDescription).join(', ')}`,
    );
  }

  if (problems.length) {
    throw new DocsUsageError(`get: ${problems.join('; ')}`);
  }

  return { documents: ids.map((id) => contextEntry(byId.get(id)!)), skipped };
}

/** Separates a document id from a section id in a `get --content` reference (`<id>#<sectionId>`). */
export const SECTION_REFERENCE_SEPARATOR = '#';

export interface ReadSection {
  /** The section id `docs search` reports (`sections[].sectionId`). */
  readonly sectionId: string;
  readonly headingPath: string[];
  /** 1-based line of the section's heading in the file. */
  readonly line: number;
}

/**
 * One item of `get --content`: a whole document (its whole file, frontmatter included), or with
 * `section` one of its sections (its Markdown from the heading line, subsections included).
 */
export interface DocumentRead extends ContextEntry {
  readonly section?: ReadSection;
  readonly content: string;
}

/**
 * `get --content <ref...>`: each reference is a stable document id (the whole document) or
 * `<id>#<sectionId>` (one section with its subsections; `_top` is the text before the first
 * heading), returned in the given order. Every reference is checked before anything is read out:
 * any unknown or inactive document or unknown section fails the whole call with one
 * `DocsUsageError` naming all of them (and the valid section ids of each document concerned).
 */
export function getDocumentReads(
  corpus: DocsCorpus,
  refs: readonly string[],
): Skipping<DocumentRead> {
  const parsedRefs = refs.map((ref) => {
    const at = ref.indexOf(SECTION_REFERENCE_SEPARATOR);

    return at === -1
      ? { ref, id: ref, sectionId: undefined }
      : { ref, id: ref.slice(0, at), sectionId: ref.slice(at + 1) };
  });
  const ids = [...new Set(parsedRefs.map((ref) => ref.id))];
  const found = getDocuments(corpus, ids);
  const entries = new Map(found.documents.map((entry) => [entry.id, entry]));

  const outlines = new Map<string, DocumentOutline>();
  const outline = (id: string) => {
    let known = outlines.get(id);
    if (known === undefined) {
      known = readOutline(corpus, entries.get(id)!.file);
      outlines.set(id, known);
    }

    return known;
  };

  const unknown = parsedRefs.filter(
    (ref) => ref.sectionId !== undefined && !outline(ref.id).byId.has(ref.sectionId),
  );
  if (unknown.length > 0) {
    const documents = [...new Set(unknown.map((ref) => ref.id))];

    throw new DocsUsageError(
      `get: unknown section id(s): ${unknown.map((ref) => ref.ref).join(', ')} (${documents
        .map(
          (id) =>
            `sections of '${id}': ${outline(id)
              .sections.map((section) => section.id)
              .join(', ')}`,
        )
        .join('; ')})`,
    );
  }

  const documents = parsedRefs.map(({ id, sectionId }): DocumentRead => {
    const entry = entries.get(id)!;
    if (sectionId === undefined) {
      return { ...entry, content: corpus.repo.readMarkdownFile(entry.file) };
    }

    const { sections, byId, lines, bodyLine } = outline(id);
    const index = byId.get(sectionId)!;
    const section = sections[index]!;
    const next = sections.slice(index + 1).find((other) => !other.id.startsWith(`${sectionId}/`));
    const end = next === undefined ? lines.length : next.startLine - 1;

    return {
      ...entry,
      section: {
        sectionId,
        headingPath: [...section.headingPath],
        line: bodyLine + section.startLine - 1,
      },
      content: lines
        .slice(section.startLine - 1, end)
        .join('\n')
        .trimEnd(),
    };
  });

  return { documents, skipped: found.skipped };
}

interface DocumentOutline {
  readonly sections: readonly MarkdownSection[];
  readonly byId: ReadonlyMap<string, number>;
  /** The body's lines. */
  readonly lines: readonly string[];
  readonly bodyLine: number;
}

function readOutline(corpus: DocsCorpus, file: string): DocumentOutline {
  const parsed = parseFrontmatter(corpus.repo.readMarkdownFile(file), file)!;
  const sections = splitMarkdownSections(parsed.body);

  return {
    sections,
    byId: new Map(sections.map((section, index) => [section.id, index])),
    lines: parsed.body.replace(/\r\n?/gu, '\n').split('\n'),
    bodyLine: parsed.bodyLine,
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
): Skipping<ContextEntry> {
  const { docs, skipped } = loadReadableDocs(corpus);
  const contextCorpus = docs.filter((doc) => !isNonAuthoritative(corpus.settings, doc.file));
  const results = searchDocs(contextCorpus, {
    query,
    ...(limit === undefined ? {} : { limit }),
    excludeStatuses: INACTIVE_STATUSES,
  });

  return { documents: results.map(contextEntry), skipped };
}
