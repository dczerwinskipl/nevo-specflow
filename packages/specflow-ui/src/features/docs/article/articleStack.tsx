import { createContext, useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { defineSecondaryStack, useSecondaryStack } from '@nevo/ui';
import type { WorkspaceDocsTree } from '@nevo/specflow-contracts/docs';
import { translateNow } from '../../../i18n/message';
import { useNotify } from '../../../shared/notifications/notifications';
import { useDocsTree } from '../read-model';
import { ArticleBody } from './ArticleBody';
import { ArticleNavigationContext, type ArticleNavigation } from './articleContext';
import { articleActions } from './articleActions';
import type { ArticleScrollMemory } from './DocsArticleView';
import { ArticleTitle } from './ArticleTitle';
import { useArticleSummary } from './useArticleSummary';

/** The article the Narrow stack starts with (opened from the tree, a result or the address). */
export interface ArticleStackRoot {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly documentId: string;
  readonly sectionId?: string;
  /** The document's title: the stack names its screens with it (Back "Back to <title>"). */
  readonly title: string;
  readonly fromReader: boolean;
}

interface ArticlePages {
  article: Record<string, never>;
  /** A document reached by a link from the article below it; `entry` keys its reading position. */
  linked: { documentId: string; sectionId?: string; title: string; entry: string };
}

interface ArticleStackData {
  readonly root: ArticleStackRoot;
  readonly tree: WorkspaceDocsTree;
  readonly notify: (message: string) => void;
  readonly t: TFunction;
}

/**
 * Reading positions of the stacked article screens, by entry: the stack remounts a screen on Back
 * and does not restore stacked scroll itself. Owned by the reader, emptied when a new stack opens.
 */
export const ArticleStackMemoryContext = createContext<Map<string, number> | null>(null);

function useEntryMemory(entry: string): ArticleScrollMemory | undefined {
  const memory = useContext(ArticleStackMemoryContext);

  return useMemo(
    () =>
      memory
        ? { get: () => memory.get(entry), set: (top: number) => void memory.set(entry, top) }
        : undefined,
    [memory, entry],
  );
}

function StackArticle({
  data,
  documentId,
  sectionId,
  entry,
}: {
  data: ArticleStackData;
  documentId: string;
  sectionId?: string;
  entry: string;
}) {
  const stack = useSecondaryStack<ArticlePages>();
  const memories = useContext(ArticleStackMemoryContext);
  const memory = useEntryMemory(entry);
  const { root, tree, t } = data;
  const navigation = useMemo<ArticleNavigation>(
    () => ({
      workspaceId: root.workspaceId,
      // A link pushes another article screen: Back returns to this one at its reading position.
      openDocument: (target, section) => {
        const title =
          tree.documents.find((doc) => doc.documentId === target)?.title ??
          t('docs.article.fallbackTitle');
        const next = `${entry}/${target}`;
        // A new hop starts at its own top or section, not at a position of an earlier visit.
        memories?.delete(next);
        void stack.navTo('linked', { documentId: target, sectionId: section, title, entry: next });
      },
    }),
    [root.workspaceId, tree, t, stack, entry, memories],
  );

  return (
    <ArticleNavigationContext.Provider value={navigation}>
      <ArticleBody
        chromeKey={`stack:${entry}`}
        workspaceId={root.workspaceId}
        workspaceName={root.workspaceName}
        documentId={documentId}
        sectionId={sectionId}
        tree={tree}
        // Every stacked article was listed when it was opened.
        fromReader={root.fromReader || entry !== rootEntry}
        scrollMemory={memory}
      />
    </ArticleNavigationContext.Provider>
  );
}

function StackTitle({
  data,
  documentId,
  entry,
}: {
  data: ArticleStackData;
  documentId: string;
  entry: string;
}) {
  const summary = useArticleSummary(data.root.workspaceId, documentId, data.tree);

  return (
    <ArticleTitle chromeKey={`stack:${entry}`} title={summary.title} contents={summary.contents} />
  );
}

const rootEntry = 'root';

/** The overflow actions of a stacked article, once the document is known. */
function stackActions(data: ArticleStackData, documentId: string) {
  const listed = data.tree.documents.find((doc) => doc.documentId === documentId);

  return listed
    ? articleActions({
        workspaceId: data.root.workspaceId,
        documentId,
        path: `${data.tree.docsRoot}/${listed.path}`,
        notify: data.notify,
        t: data.t,
      })
    : [];
}

/**
 * Narrow: the article is pushed over the tree as a Secondary stack screen. An internal link pushes
 * another article screen, so the header Back returns to the previous article; only the first
 * screen's Back returns to the documentation. Each header names its own document.
 */
export const docsArticleStack = defineSecondaryStack<
  ArticleStackRoot,
  ArticleStackData,
  ArticlePages
>({
  id: 'docs-reader-article',
  initial: 'article',
  tabLabel: (root) => root.title,
  useData: (root) => {
    const tree = useDocsTree(root.workspaceId);
    const notify = useNotify();
    const { t } = useTranslation();
    if (tree.data) {
      return { status: 'ready', data: { root, tree: tree.data, notify, t } };
    }

    return tree.isError
      ? { status: 'error', retry: () => void tree.refetch() }
      : { status: 'loading' };
  },
  screens: {
    article: {
      get title() {
        return translateNow('docs.article.fallbackTitle');
      },
      header: ({ data }) => (
        <StackTitle data={data} documentId={data.root.documentId} entry={rootEntry} />
      ),
      actions: ({ data }) => stackActions(data, data.root.documentId),
      component: ({ data }) => (
        <StackArticle
          data={data}
          documentId={data.root.documentId}
          sectionId={data.root.sectionId}
          entry={rootEntry}
        />
      ),
    },
    linked: {
      get title() {
        return translateNow('docs.article.fallbackTitle');
      },
      breadcrumbLabel: (params) => params.title,
      header: ({ data, params }) => (
        <StackTitle data={data} documentId={params.documentId} entry={params.entry} />
      ),
      actions: ({ data, params }) => stackActions(data, params.documentId),
      component: ({ data, params }) => (
        <StackArticle
          data={data}
          documentId={params.documentId}
          sectionId={params.sectionId}
          entry={params.entry}
        />
      ),
    },
  },
});
