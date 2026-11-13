import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppContent,
  InlineNote,
  MarkdownDocument,
  ScrollArea,
  useContainerMinWidth,
} from '@nevo/ui';
import type { WorkspaceDocsArticle, WorkspaceDocsTree } from '@nevo/specflow-contracts/docs';
import { useMarkdownLabels } from '../../../i18n/useMarkdownLabels';
import { DocumentOutline } from '../../../shared/document-reading/DocumentOutline';
import { DocumentOutlineSheet } from '../../../shared/document-reading/DocumentOutlineSheet';
import { DocumentProperties } from '../../../shared/document-reading/DocumentProperties';
import {
  markdownOutline,
  outlineColumnMinWidth,
} from '../../../shared/document-reading/markdownOutline';
import { topSectionId } from '../links/linkPolicy';
import { useDocsReferenceRenderers } from '../links/useDocsReferenceRenderers';
import { ArticleSectionsContext, type ArticleSections } from './articleContext';
import { useArticleChromeOf } from './articleChrome';
import { RelatedDocuments } from './RelatedDocuments';
import { docsReferenceViews } from './referenceViews';

/** A reading position kept outside the article (the Narrow stack remounts it on Back). */
export interface ArticleScrollMemory {
  readonly get: () => number | undefined;
  readonly set: (top: number) => void;
}

/**
 * One article (the Documents preview's anatomy): a quiet note for a non-authoritative document,
 * Properties, the Markdown body with its links and images decided by the reader's policies, and
 * Related. From an 840 px panel the Properties and the Contents sit in a sticky column beside the
 * text; narrower panels show Properties above the text and the Contents as a sheet the header
 * opens. Opening a section moves focus to its heading.
 */
export function DocsArticleView({
  chromeKey,
  article,
  tree,
  sectionId,
  scrollMemory,
}: {
  /** Identifies this shown article to the header (its Contents button). */
  chromeKey: string;
  article: WorkspaceDocsArticle;
  tree: WorkspaceDocsTree;
  /** The section to open at (the address's `#sectionId`, a result's section). */
  sectionId?: string;
  scrollMemory?: ArticleScrollMemory;
}) {
  const { t } = useTranslation();
  const markdownLabels = useMarkdownLabels();
  const { document: doc, body, sections, workspaceId } = article;
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [activeLine, setActiveLine] = useState<number>();
  const { store, sheetOpen } = useArticleChromeOf(chromeKey);
  const width = useContainerMinWidth(outlineColumnMinWidth, { hysteresis: 16 });
  const headings = useMemo(() => {
    const found = markdownOutline(body);

    return found.length > 1 ? found : [];
  }, [body]);
  const column = width.measured && width.matches && headings.length > 0;
  const renderers = useDocsReferenceRenderers(
    { workspaceId, tree, documentId: doc.documentId, documentPath: doc.path },
    docsReferenceViews,
  );

  // The header's Contents button exists only without the column.
  useLayoutEffect(() => {
    store.setColumn(chromeKey, column);

    return () => store.setColumn(chromeKey, false);
  }, [store, chromeKey, column]);

  const focusTarget = (target: HTMLElement | null | undefined, pointer = false) => {
    if (!target) {
      return false;
    }

    target.setAttribute('tabindex', '-1');
    target.scrollIntoView({ block: 'start' });
    target.focus({ preventScroll: true, focusVisible: !pointer });

    return true;
  };

  const goToLine = (line: number, pointer = false) => {
    if (focusTarget(panel?.querySelector<HTMLElement>(`[data-source-line="${line}"]`), pointer)) {
      setActiveLine(line);
    }
  };

  const goToSection = (id: string) => {
    if (id === topSectionId) {
      panel?.scrollTo({ top: 0 });

      return;
    }

    const line = sections.find((section) => section.sectionId === id)?.line;
    if (line !== undefined) {
      goToLine(line);

      return;
    }

    // Not a section of the article (a GFM footnote): an element of the rendered body, if any.
    focusTarget(
      panel?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`) ??
        panel?.querySelector<HTMLElement>(`[id="user-content-${CSS.escape(id)}"]`),
    );
  };

  const sectionsContext: ArticleSections = { goToSection };

  // Entering the article: the remembered reading position (Back on Narrow), else the section the
  // address names, else the top.
  // Only once the panel's width is known: the column arrangement re-parents the text, and a
  // heading focused before that would lose focus.
  useLayoutEffect(() => {
    if (!panel || !width.measured) {
      return;
    }

    const remembered = scrollMemory?.get();
    if (remembered !== undefined) {
      panel.scrollTop = remembered;

      return;
    }

    if (sectionId !== undefined) {
      goToSection(sectionId);
    } else {
      panel.scrollTo({ top: 0 });
    }
    // Only a new article or section moves the reader; the callbacks are recreated every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, width.measured, doc.documentId, sectionId]);

  useEffect(() => {
    if (!panel || !scrollMemory) {
      return;
    }

    const save = () => scrollMemory.set(panel.scrollTop);
    panel.addEventListener('scroll', save, { passive: true });

    return () => panel.removeEventListener('scroll', save);
  }, [panel, scrollMemory]);

  const properties = [
    { key: t('docs.article.properties.path'), value: `${tree.docsRoot}/${doc.path}` },
    { key: t('docs.article.properties.type'), value: doc.type },
    { key: t('docs.article.properties.status'), value: doc.status },
    { key: t('docs.article.properties.summary'), value: doc.summary },
    { key: t('docs.article.properties.id'), value: doc.documentId },
  ];
  const lead = doc.nonAuthoritative ? (
    <div className="mb-4">
      <InlineNote>{t('docs.article.nonAuthoritativeNote')}</InlineNote>
    </div>
  ) : null;
  const text = (
    <>
      <MarkdownDocument
        source={body}
        sourceLines
        labels={markdownLabels}
        renderLink={renderers.renderLink}
        renderImage={renderers.renderImage}
      />
      <RelatedDocuments related={doc.related} />
    </>
  );

  return (
    <ArticleSectionsContext.Provider value={sectionsContext}>
      <AppContent className="h-full w-full">
        {/* Measures the panel's width (a zero-height sentinel, not the content it rearranges). */}
        <div ref={width.setElement} aria-hidden className="h-0 w-full shrink-0" />
        <ScrollArea
          direction="both"
          className="min-h-0 flex-1"
          contentClassName="p-6"
          viewportRef={setPanel}
        >
          {column ? (
            <div
              className="mx-auto flex items-start gap-8"
              style={{ maxWidth: 'calc(var(--spacing-content-narrow) + 352px)' }}
            >
              <div className="min-w-0 max-w-content-narrow flex-1">
                {lead}
                {text}
              </div>
              <aside
                aria-label={t('docs.article.columnLabel')}
                className="sticky top-0 grid shrink-0 grid-cols-1 gap-4"
                style={{ width: 'clamp(232px, 27%, 320px)' }}
              >
                <DocumentProperties properties={properties} anchored={false} />
                <DocumentOutline headings={headings} activeLine={activeLine} onSelect={goToLine} />
              </aside>
            </div>
          ) : (
            <div className="mx-auto max-w-content-narrow">
              {lead}
              <DocumentProperties properties={properties} />
              {text}
            </div>
          )}
        </ScrollArea>
      </AppContent>
      <DocumentOutlineSheet
        open={sheetOpen && !column}
        headings={headings}
        activeLine={activeLine}
        onOpenChange={(open) => {
          if (!open) {
            store.closeSheet();
          }
        }}
        onSelected={goToLine}
        restoreFocusTo={store.opener}
      />
    </ArticleSectionsContext.Provider>
  );
}
