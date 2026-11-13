import { createContext, useCallback, useContext, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  defineSecondaryStack,
  useSecondaryLeaveGuard,
  useSecondaryStack,
  type SecondaryStackActions,
} from '@nevo/ui';
import type { WorkspaceDocsTree } from '@nevo/specflow-contracts/docs';
import { translateNow } from '../../../i18n/message';
import { useNotify } from '../../../shared/notifications/notifications';
import { useDocsTree } from '../read-model';
import { ArticleBody } from './ArticleBody';
import { articleActions } from './articleActions';
import { ArticleTitle } from './ArticleTitle';
import { useArticleSummary } from './useArticleSummary';

/** An article screen of the Narrow stack: the document of one history entry of the reader. */
export interface ArticleStackEntry {
  readonly documentId: string;
  readonly sectionId?: string;
  /** The document's title: the stack names its screens with it (Back "Back to <title>"). */
  readonly title: string;
  /** The history entry whose address names the document; it keys the reading position. */
  readonly entry: string;
}

/** The article the Narrow stack starts with (the address's document, opened over the tree). */
export interface ArticleStackRoot extends ArticleStackEntry {
  readonly workspaceId: string;
}

export interface ArticlePages {
  article: Record<string, never>;
  /** A document reached by a link from the article below it (the previous history entry). */
  linked: ArticleStackEntry;
}

interface ArticleStackData {
  readonly root: ArticleStackRoot;
  readonly tree: WorkspaceDocsTree;
  readonly notify: (message: string) => void;
  readonly t: TFunction;
}

/**
 * The reader's hold on the Narrow stack, which follows the address: only the reader moves it
 * (opens, pushes, pops, closes), when the address changes. Any other leave of a screen is the
 * user's header Back: it is refused and becomes a move of the address instead (`onUserBack`),
 * which then moves the stack. Owned by the reader's `useNarrowArticleStack`; every mounted screen
 * registers its stack so the reader can push and pop through the top one.
 */
export class ArticleStackControl {
  /** The entries the stack shows, root first (the reader's record of what it opened and pushed). */
  chain: readonly string[] = [];
  /** The reader's own moves still running: while any is, screens may leave. */
  private moving = 0;
  /** The mounted screens' stacks, by entry: the reader pushes and pops through the top one's. */
  readonly screens = new Map<string, SecondaryStackActions<ArticlePages>>();
  /** The header Back of the screen the address names: move the address (the root leaves it). */
  onUserBack: (root: boolean) => void = () => undefined;

  register(entry: string, stack: SecondaryStackActions<ArticlePages>) {
    this.screens.set(entry, stack);

    return () => {
      if (this.screens.get(entry) === stack) {
        this.screens.delete(entry);
      }
    };
  }

  /** Runs one of the reader's own moves of the stack (its leave guards let it through). */
  move(command: () => Promise<boolean>) {
    this.moving += 1;
    void command().finally(() => {
      this.moving -= 1;
    });
  }

  /** The leave guard of a screen: the reader's moves pass, the user's Back moves the address. */
  mayLeave(root: boolean): boolean {
    if (this.moving > 0) {
      return true;
    }

    this.onUserBack(root);

    return false;
  }
}

export const ArticleStackControlContext = createContext<ArticleStackControl | null>(null);

function StackArticle({
  data,
  page,
  root,
}: {
  data: ArticleStackData;
  page: ArticleStackEntry;
  root: boolean;
}) {
  const stack = useSecondaryStack<ArticlePages>();
  const control = useContext(ArticleStackControlContext);
  const { entry } = page;
  useEffect(() => control?.register(entry, stack), [control, entry, stack]);
  const guard = useCallback(() => (control ? control.mayLeave(root) : true), [control, root]);
  useSecondaryLeaveGuard(guard);

  return (
    <ArticleBody
      chromeKey={`stack:${entry}`}
      workspaceId={data.root.workspaceId}
      documentId={page.documentId}
      sectionId={page.sectionId}
      tree={data.tree}
      entry={entry}
    />
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
 * Narrow: the article is pushed over the tree as a Secondary stack screen. A link of an article
 * changes the address and pushes another article screen, so the header Back (like browser Back)
 * returns to the previous article; only the first screen's Back returns to the documentation.
 * Each header names its own document. Links open through the reader's `ArticleNavigationContext`.
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
        <StackTitle data={data} documentId={data.root.documentId} entry={data.root.entry} />
      ),
      actions: ({ data }) => stackActions(data, data.root.documentId),
      component: ({ data }) => <StackArticle data={data} page={data.root} root />,
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
      component: ({ data, params }) => <StackArticle data={data} page={params} root={false} />,
    },
  },
});
