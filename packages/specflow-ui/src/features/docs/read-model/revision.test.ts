import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { DocsApi } from './api';
import { docsKeys } from './queries';
import { leaveDocsWorkspace, outdatedByRevision, reconcileDocsRevision } from './revision';
import { docsQueries } from './useDocsReads';

const tree = (corpusRevision: string) => ({ workspaceId: 'a', corpusRevision });
const article = (corpusRevision: string) => ({
  kind: 'article',
  article: { workspaceId: 'a', corpusRevision },
});
const refusal = (corpusRevision: string) => ({
  kind: 'not-found',
  refusal: { workspaceId: 'a', corpusRevision },
});

function cache() {
  const client = new QueryClient();
  const isStale = (key: readonly unknown[]) =>
    client.getQueryCache().find({ queryKey: key, exact: true })?.state.isInvalidated ?? false;

  return { client, isStale };
}

describe('corpus revision coherence', () => {
  it('selects the answers of another corpus, not those of the same one or not read yet', () => {
    expect(
      outdatedByRevision(
        [
          { key: ['t'], revision: 'r1' },
          { key: ['d'], revision: 'r2' },
          { key: ['s'], revision: undefined },
        ],
        'r2',
      ),
    ).toEqual([['t']]);
  });

  it('a newer tree refreshes the article and the search together, not itself', () => {
    const { client, isStale } = cache();
    const search = docsKeys.search('a', { q: 'x' });
    client.setQueryData(docsKeys.tree('a'), tree('r1'));
    client.setQueryData(docsKeys.document('a', 'd'), article('r1'));
    client.setQueryData(search, { ...tree('r1'), results: [] });

    reconcileDocsRevision(client, 'a', docsKeys.tree('a'), 'r2');

    expect(isStale(docsKeys.tree('a'))).toBe(false);
    expect(isStale(docsKeys.document('a', 'd'))).toBe(true);
    expect(isStale(search)).toBe(true);
  });

  it('a document refusal of a newer corpus refreshes the tree; one of the same corpus does not', () => {
    const { client, isStale } = cache();
    client.setQueryData(docsKeys.tree('a'), tree('r1'));
    client.setQueryData(docsKeys.document('a', 'gone'), refusal('r1'));

    reconcileDocsRevision(client, 'a', docsKeys.document('a', 'gone'), 'r1');
    expect(isStale(docsKeys.tree('a'))).toBe(false);

    reconcileDocsRevision(client, 'a', docsKeys.document('a', 'gone'), 'r2');
    expect(isStale(docsKeys.tree('a'))).toBe(true);
  });

  it('reconciles as each read answers', async () => {
    const { client, isStale } = cache();
    client.setQueryData(docsKeys.document('a', 'd'), article('r1'));
    const api = { tree: () => Promise.resolve(tree('r2')) } as unknown as DocsApi;

    await client.fetchQuery(docsQueries.tree(api, client, 'a'));

    expect(isStale(docsKeys.document('a', 'd'))).toBe(true);
  });

  it('a refetch answering the revision the key already held still refreshes another corpus', async () => {
    const { client, isStale } = cache();
    client.setQueryData(docsKeys.tree('a'), tree('r2'));
    client.setQueryData(docsKeys.document('a', 'd'), article('r1'));
    const api = { tree: () => Promise.resolve(tree('r2')) } as unknown as DocsApi;

    await client.fetchQuery({ ...docsQueries.tree(api, client, 'a'), staleTime: 0 });

    expect(isStale(docsKeys.document('a', 'd'))).toBe(true);
  });

  it('a late answer of an older corpus ends with every answer on the newer one', async () => {
    const client = new QueryClient();
    let corpus = 'A';
    let answerFirstArticle: (value: unknown) => void = () => undefined;
    let articleReads = 0;
    // Answers come over the network: never within the microtasks that store another answer.
    const answer = <T>(value: T) =>
      new Promise<T>((resolve) => setTimeout(() => resolve(value), 0));
    const api = {
      tree: () => answer(tree(corpus)),
      article: () => {
        articleReads += 1;

        return articleReads === 1
          ? new Promise((resolve) => {
              answerFirstArticle = resolve;
            })
          : answer(article(corpus));
      },
    } as unknown as DocsApi;
    const treeObserver = new QueryObserver(client, docsQueries.tree(api, client, 'a'));
    const articleObserver = new QueryObserver(client, docsQueries.document(api, client, 'a', 'd'));
    const stop = [treeObserver.subscribe(() => undefined)];
    await vi.waitFor(() => expect(client.getQueryData(docsKeys.tree('a'))).toEqual(tree('A')));
    // The article's first read is in flight on A; the corpus changes and the tree refetches to B.
    stop.push(articleObserver.subscribe(() => undefined));
    corpus = 'B';
    await treeObserver.refetch();
    // The article answers late, from A.
    answerFirstArticle(article('A'));

    await vi.waitFor(() => {
      expect(client.isFetching()).toBe(0);
      expect(client.getQueryData(docsKeys.tree('a'))).toEqual(tree('B'));
      expect(client.getQueryData(docsKeys.document('a', 'd'))).toEqual(article('B'));
    });
    stop.forEach((unsubscribe) => unsubscribe());
  });

  it('touches only the workspace the answer was requested for', () => {
    const { client, isStale } = cache();
    client.setQueryData(docsKeys.tree('b'), { workspaceId: 'b', corpusRevision: 'r1' });
    client.setQueryData(['workspaces'], { projectFolderId: 'a', workspaces: [] });

    reconcileDocsRevision(client, 'a', docsKeys.tree('a'), 'r2');

    expect(isStale(docsKeys.tree('b'))).toBe(false);
    expect(isStale(['workspaces'])).toBe(false);
    expect(docsKeys.tree('a')[0]).not.toBe('workspaces');
  });

  it('leaving a workspace drops its answers and keeps the other workspaces and the list', () => {
    const { client } = cache();
    client.setQueryData(docsKeys.tree('a'), tree('r1'));
    client.setQueryData(docsKeys.tree('b'), { workspaceId: 'b', corpusRevision: 'r1' });
    client.setQueryData(['workspaces'], { projectFolderId: 'a', workspaces: [] });

    leaveDocsWorkspace(client, 'a');

    expect(client.getQueryData(docsKeys.tree('a'))).toBeUndefined();
    expect(client.getQueryData(docsKeys.tree('b'))).toBeDefined();
    expect(client.getQueryData(['workspaces'])).toBeDefined();
  });
});
