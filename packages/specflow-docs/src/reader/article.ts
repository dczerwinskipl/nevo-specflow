// One article of a workspace's documentation: the metadata and the body of a single file read,
// without the frontmatter, with its sections and the state of every document it relates to.

import { splitMarkdownSections } from '@nevo/ai-semantic-search';

import type { DocsCorpus } from '../corpus/corpus';
import { asString, parseFrontmatter } from '../frontmatter/contract';
import { DocsError } from '../errors';
import { sha256, type DocsChunks } from '../semantic-index/chunk-source';
import { skippedUnderDocsRoot, underDocsRoot } from './paths';

export type RelatedState = 'active' | 'inactive' | 'skipped' | 'missing';

export interface RelatedDocument {
  readonly documentId: string;
  /** Known for an active or inactive document. */
  readonly title?: string;
  readonly state: RelatedState;
}

export interface ArticleSection {
  /** The id search reports for the section (`DocsSearchSection.sectionId`). */
  readonly sectionId: string;
  readonly headingPath: readonly string[];
  /** 1-based line of the heading in `body` (frontmatter excluded). */
  readonly line: number;
}

export interface ArticleDocument {
  readonly documentId: string;
  readonly title: string;
  readonly type: string;
  readonly status: string;
  /** Relative to `docs.root`. */
  readonly path: string;
  readonly summary: string;
  readonly proposal: boolean;
  readonly scope?: string;
  readonly areas: readonly string[];
  readonly tags: readonly string[];
  readonly related: readonly RelatedDocument[];
}

export type ArticleResult =
  | {
      readonly kind: 'active';
      readonly revision: string;
      readonly document: ArticleDocument;
      readonly body: string;
      readonly sections: readonly ArticleSection[];
    }
  | {
      /** No body: the document is deprecated or superseded (E4). */
      readonly kind: 'inactive';
      readonly revision: string;
      readonly documentId: string;
      readonly status: string;
      readonly supersededBy?: { readonly documentId: string; readonly title: string };
    }
  | {
      /** The id belongs to a document left out of the reader (invalid or duplicated). */
      readonly kind: 'skipped';
      readonly revision: string;
      readonly documentId: string;
      readonly skipped: readonly { readonly path: string; readonly error: string }[];
    }
  | { readonly kind: 'not-found'; readonly revision: string; readonly documentId: string };

/**
 * Read the article `documentId` of the loaded corpus `snapshot`. The metadata comes from the same
 * string as the body (one file read), so they cannot disagree; the snapshot only decides which file
 * the id names and the state of related documents. A file that changed or vanished since
 * the snapshot is `not-found`.
 */
export async function readArticle(
  corpus: DocsCorpus,
  snapshot: DocsChunks,
  documentId: string,
): Promise<ArticleResult> {
  const { revision } = snapshot;
  const active = snapshot.documents.find(({ record }) => record.id === documentId);
  if (active === undefined) {
    return describeUnreadable(corpus, snapshot, documentId);
  }

  let content: string;
  try {
    content = await corpus.repo.readMarkdownFileAsync(active.record.file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { kind: 'not-found', revision, documentId };
    }

    throw error;
  }

  // The snapshot decided what this id names; a file edited since then is not that document.
  if (sha256(content) !== snapshot.contentHashes.get(active.record.file)) {
    return { kind: 'not-found', revision, documentId };
  }

  const parsed = parseOrUndefined(content, active.record.file);
  if (parsed?.frontmatter.id !== documentId) {
    return { kind: 'not-found', revision, documentId };
  }

  const { frontmatter, body } = parsed;
  const related = Array.isArray(frontmatter.related)
    ? frontmatter.related.map((id) => relatedDocument(snapshot, asString(id)))
    : [];

  return {
    kind: 'active',
    revision,
    document: {
      documentId,
      title: asString(frontmatter.title),
      type: asString(frontmatter.type),
      status: asString(frontmatter.status),
      path: underDocsRoot(corpus.settings.root, active.record.file),
      summary: typeof frontmatter.summary === 'string' ? frontmatter.summary.trim() : '',
      proposal: active.proposal,
      ...(typeof frontmatter.scope === 'string' ? { scope: frontmatter.scope } : {}),
      areas: strings(frontmatter.areas),
      tags: strings(frontmatter.tags),
      related,
    },
    body,
    sections: splitMarkdownSections(body).map((section) => ({
      sectionId: section.id,
      headingPath: [...section.headingPath],
      line: section.startLine,
    })),
  };
}

function describeUnreadable(
  corpus: DocsCorpus,
  snapshot: DocsChunks,
  documentId: string,
): ArticleResult {
  const { revision } = snapshot;
  const inactive = snapshot.inactive.find((record) => record.id === documentId);
  if (inactive !== undefined) {
    const successorId = typeof inactive.superseded_by === 'string' ? inactive.superseded_by : '';
    const successor = successorId === '' ? undefined : relatedDocument(snapshot, successorId);

    return {
      kind: 'inactive',
      revision,
      documentId,
      status: asString(inactive.status),
      ...(successor?.title === undefined
        ? {}
        : { supersededBy: { documentId: successorId, title: successor.title } }),
    };
  }

  const skipped = snapshot.skippedById.get(documentId);
  if (skipped !== undefined) {
    return {
      kind: 'skipped',
      revision,
      documentId,
      skipped: skippedUnderDocsRoot(corpus.settings.root, skipped),
    };
  }

  return { kind: 'not-found', revision, documentId };
}

function relatedDocument(snapshot: DocsChunks, documentId: string): RelatedDocument {
  const active = snapshot.documents.find(({ record }) => record.id === documentId);
  if (active !== undefined) {
    return { documentId, title: asString(active.record.title), state: 'active' };
  }

  const inactive = snapshot.inactive.find((record) => record.id === documentId);
  if (inactive !== undefined) {
    return { documentId, title: asString(inactive.title), state: 'inactive' };
  }

  return { documentId, state: snapshot.skippedById.has(documentId) ? 'skipped' : 'missing' };
}

function parseOrUndefined(content: string, file: string) {
  try {
    return parseFrontmatter(content, file) ?? undefined;
  } catch (error) {
    if (error instanceof DocsError) {
      return undefined;
    }

    throw error;
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : [];
}
