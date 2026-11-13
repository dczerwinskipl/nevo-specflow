import { HttpClientError } from '@nevo/http-client';
import type {
  WorkspaceDocsArticle,
  WorkspaceDocsSearch,
  WorkspaceDocsTree,
} from '@nevo/specflow-contracts/docs';
import type { WorkspaceList, WorkspaceListItem } from '@nevo/specflow-contracts/workspaces';
import { ApiError } from '../../../api';
import type { DocsApi, DocsArticleResult } from '../read-model';
import {
  docsFor,
  inactiveDocs,
  isProposal,
  search,
  sectionsOf,
  skippedDocsFor,
  workspaces,
  type MockDoc,
} from './readerFixtures.stories-support';

/** What the fixture Runtime answers, per story. */
export type ReaderFixtureScenario =
  | 'reader'
  | 'no-root-index'
  | 'loading'
  | 'not-configured'
  | 'empty-corpus'
  | 'skipped-one'
  | 'skipped-many'
  | 'forbidden'
  | 'docs-unavailable'
  | 'index-building';

export const projectFolderId = 'ws-main';

const absolute = (folder: string) =>
  folder.startsWith('D:') ? folder : `D:/repos/nevo-specflow/${folder}`;

/** The registered workspaces (`GET /api/workspaces`); `single` keeps only the project folder. */
export function fixtureWorkspaceList(options: { single?: boolean } = {}): WorkspaceList {
  const items: WorkspaceListItem[] = workspaces.map((workspace) => ({
    workspaceId: workspace.workspaceId,
    kind: workspace.kind === 'main' ? 'primary' : 'linked',
    name: workspace.name,
    path: absolute(workspace.folder),
    available: workspace.available,
    ...(workspace.available ? {} : { unavailableReason: 'checkout-unavailable' as const }),
    isRuntimeWorkspace: workspace.isRuntimeWorkspace === true,
    specifications: workspace.specifications.map((title, index) => ({
      specId: `${workspace.workspaceId}-spec-${index}`,
      title,
    })),
    ...(workspace.dirty ? { dirty: true } : {}),
  }));

  return {
    projectFolderId,
    workspaces: options.single
      ? items.filter((item) => item.workspaceId === projectFolderId)
      : items,
  };
}

const revision = (workspaceId: string) => `rev-${workspaceId}`;

function docsError(code: string, status: number, data: Record<string, unknown> = {}): ApiError {
  return new ApiError({
    kind:
      status === 403 ? 'forbidden' : status === 409 || status === 503 ? 'unavailable' : 'not-found',
    operation: 'docs.tree',
    outcome: 'not-applied',
    retryable: status !== 403,
    status,
    code,
    cause: new HttpClientError('Refused', {
      kind: 'http',
      status,
      data: { error: 'Refused', code, ...data },
    }),
  });
}

/** Never settles: the loading state stays on screen. */
const pending = <T>() => new Promise<T>(() => undefined);

function documentsOf(workspaceId: string, scenario: ReaderFixtureScenario): MockDoc[] {
  const skipped = skippedDocsFor(scenario).map((item) => item.path);

  return docsFor(workspaceId).filter(
    (doc) =>
      !skipped.includes(doc.path) && !(scenario === 'no-root-index' && doc.path === 'README.md'),
  );
}

export function fixtureTree(
  workspaceId: string,
  scenario: ReaderFixtureScenario,
): WorkspaceDocsTree {
  const documents = scenario === 'empty-corpus' ? [] : documentsOf(workspaceId, scenario);

  return {
    workspaceId,
    corpusRevision: revision(workspaceId),
    docsRoot: 'docs',
    ...(documents.some((doc) => doc.path === 'README.md')
      ? { rootIndexDocumentId: documents.find((doc) => doc.path === 'README.md')!.id }
      : {}),
    documents: documents.map((doc) => ({
      documentId: doc.id,
      title: doc.title,
      type: doc.type,
      status: doc.status,
      path: doc.path,
      summary: doc.summary,
      proposal: isProposal(doc.path),
    })),
    inactive: Object.entries(inactiveDocs).map(([path, inactive]) => ({
      documentId: inactive.id,
      path,
      status: 'superseded',
      ...(inactive.supersededBy ? { supersededBy: inactive.supersededBy } : {}),
    })),
    skipped: skippedDocsFor(scenario),
  };
}

function fixtureArticle(
  workspaceId: string,
  documentId: string,
  scenario: ReaderFixtureScenario,
): DocsArticleResult {
  const corpus = { workspaceId, corpusRevision: revision(workspaceId) };
  const documents = documentsOf(workspaceId, scenario);
  const doc = documents.find((item) => item.id === documentId);
  const inactive = Object.values(inactiveDocs).find((item) => item.id === documentId);
  if (inactive) {
    const successor = documents.find((item) => item.id === inactive.supersededBy);

    return {
      kind: 'inactive',
      refusal: {
        error: 'Inactive',
        code: 'DOCS_DOCUMENT_INACTIVE',
        status: 'superseded',
        ...corpus,
        ...(successor
          ? { supersededBy: { documentId: successor.id, title: successor.title } }
          : {}),
      },
    };
  }

  if (!doc) {
    return {
      kind: 'not-found',
      refusal: { error: 'Not found', code: 'DOCS_DOCUMENT_NOT_FOUND', ...corpus },
    };
  }

  const article: WorkspaceDocsArticle = {
    ...corpus,
    document: {
      documentId: doc.id,
      title: doc.title,
      type: doc.type,
      status: doc.status,
      path: doc.path,
      summary: doc.summary,
      proposal: isProposal(doc.path),
      areas: doc.areas ?? [],
      tags: [],
      related: (doc.related ?? []).map((id) => {
        const target = documents.find((item) => item.id === id);
        const gone = Object.values(inactiveDocs).find((item) => item.id === id);

        return target
          ? { documentId: id, title: target.title, state: 'active' as const }
          : gone
            ? { documentId: id, title: gone.title, state: 'inactive' as const }
            : { documentId: id, state: 'missing' as const };
      }),
    },
    body: doc.body,
    sections: sectionsOf(doc.body).map((section) => ({
      sectionId: section.sectionId,
      headingPath: section.headingPath,
      line: section.line,
    })),
    skipped: skippedDocsFor(scenario),
  };

  return { kind: 'article', article };
}

function fixtureSearch(
  workspaceId: string,
  q: string,
  includeProposals: boolean,
  scenario: ReaderFixtureScenario,
): WorkspaceDocsSearch {
  const { results, hiddenProposals } = search(
    documentsOf(workspaceId, scenario),
    q,
    includeProposals,
  );
  const envelope = {
    workspaceId,
    corpusRevision: revision(workspaceId),
    results: results.map(({ doc, section, snippet }, index) => ({
      id: doc.id,
      title: doc.title,
      type: doc.type,
      status: doc.status,
      file: doc.path,
      score: 1 / (index + 1),
      sections: section
        ? [
            {
              headingPath: section.headingPath,
              sectionId: section.sectionId,
              line: section.line,
              score: 1,
              snippet,
            },
          ]
        : [],
    })),
    proposalsLeftOut: hiddenProposals,
    skipped: skippedDocsFor(scenario),
  };

  return scenario === 'index-building'
    ? {
        mode: 'lexical',
        reason: { code: 'index-building', message: 'Building' },
        indexProgress: { embedded: 62, total: 100 },
        ...envelope,
      }
    : { mode: 'hybrid', ...envelope };
}

/**
 * The reader's port over the fixture corpus. `unavailable` lists the workspaces whose checkout
 * cannot be read now (`409`) although the list says they are available.
 */
export function createFixtureDocsApi(
  scenario: ReaderFixtureScenario,
  options: {
    unavailable?: readonly string[];
    /** This document goes away in the next corpus the moment its article is read. */
    removeOnRead?: string;
  } = {},
): DocsApi {
  const refuse = (workspaceId: string): ApiError | undefined => {
    if (options.unavailable?.includes(workspaceId)) {
      return docsError('DOCS_WORKSPACE_UNAVAILABLE', 409);
    }

    switch (scenario) {
      case 'forbidden':
        return docsError('FORBIDDEN', 403);
      case 'not-configured':
        return docsError('DOCS_NOT_CONFIGURED', 503, { docsRoot: 'docs' });
      case 'docs-unavailable':
        return docsError('DOCS_UNAVAILABLE', 503);
      default:
        return undefined;
    }
  };

  let removed = false;
  const afterRemoval = (tree: WorkspaceDocsTree): WorkspaceDocsTree =>
    removed
      ? {
          ...tree,
          corpusRevision: `${tree.corpusRevision}-2`,
          documents: tree.documents.filter((doc) => doc.documentId !== options.removeOnRead),
        }
      : tree;

  return {
    tree: (workspaceId) => {
      const refusal = refuse(workspaceId);
      if (refusal) {
        return Promise.reject(refusal);
      }

      return scenario === 'loading'
        ? pending()
        : Promise.resolve(afterRemoval(fixtureTree(workspaceId, scenario)));
    },
    article: (workspaceId, documentId) => {
      const refusal = refuse(workspaceId);
      if (refusal) {
        return Promise.reject(refusal);
      }

      if (documentId === options.removeOnRead) {
        removed = true;

        return Promise.resolve({
          kind: 'not-found',
          refusal: {
            error: 'Not found',
            code: 'DOCS_DOCUMENT_NOT_FOUND',
            workspaceId,
            corpusRevision: `${revision(workspaceId)}-2`,
          },
        });
      }

      return scenario === 'loading'
        ? pending()
        : Promise.resolve(fixtureArticle(workspaceId, documentId, scenario));
    },
    search: (workspaceId, query) =>
      Promise.resolve(
        fixtureSearch(workspaceId, query.q, query.includeProposals ?? false, scenario),
      ),
  };
}
