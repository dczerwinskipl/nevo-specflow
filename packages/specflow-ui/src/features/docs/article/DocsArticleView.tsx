import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppContent, InlineNote, MarkdownDocument, ScrollArea } from '@nevo/ui';
import type { WorkspaceDocsArticle, WorkspaceDocsTree } from '@nevo/specflow-contracts/docs';
import { useMarkdownLabels } from '../../../i18n/useMarkdownLabels';
import { DocumentOutline } from '../../../shared/document-reading/DocumentOutline';
import { DocumentOutlineSheet } from '../../../shared/document-reading/DocumentOutlineSheet';
import { DocumentProperties } from '../../../shared/document-reading/DocumentProperties';
import { DocumentReadingColumns } from '../../../shared/document-reading/DocumentReadingColumns';
import {
  markdownOutline,
  outlineColumnMinWidth,
} from '../../../shared/document-reading/markdownOutline';
import { useHeadingNavigation } from '../../../shared/document-reading/useHeadingNavigation';
import { usePanelSize } from '../../../shared/document-reading/usePanelSize';
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
 * One article (the Documents preview's anatomy): a quiet note for a proposal,
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
  const { store, sheetOpen } = useArticleChromeOf(chromeKey);
  const { width: panelWidth, measured } = usePanelSize(panel);
  const headings = useMemo(() => {
    const found = markdownOutline(body);

    return found.length > 1 ? found : [];
  }, [body]);
  const column = panelWidth >= outlineColumnMinWidth && headings.length > 0;
  // The column keeps the current section marked while reading; the sheet measures it when it opens.
  const { activeLine, goTo } = useHeadingNavigation(panel, headings, {
    live: column || sheetOpen,
  });
  const renderers = useDocsReferenceRenderers(
    { workspaceId, tree, documentId: doc.documentId, documentPath: doc.path },
    docsReferenceViews,
  );

  // The header's Contents button exists only without the column.
  useLayoutEffect(() => {
    store.setColumn(chromeKey, column);

    return () => store.setColumn(chromeKey, false);
  }, [store, chromeKey, column]);

  // An element of the rendered body that is not a heading (a GFM footnote).
  const focusTarget = (target: HTMLElement | null | undefined) => {
    if (!target) {
      return;
    }

    target.setAttribute('tabindex', '-1');
    target.scrollIntoView({ block: 'start' });
    target.focus({ preventScroll: true });
  };

  /** Opens a section; entering the article at one jumps there without the smooth scroll. */
  const goToSection = (id: string, instant = false) => {
    if (id === topSectionId) {
      panel?.scrollTo({ top: 0 });

      return;
    }

    const line = sections.find((section) => section.sectionId === id)?.line;
    if (line !== undefined && goTo(line, { instant })) {
      return;
    }

    // Not a section of the article (a GFM footnote): an element of the rendered body, if any.
    focusTarget(
      panel?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`) ??
        panel?.querySelector<HTMLElement>(`[id="user-content-${CSS.escape(id)}"]`),
    );
  };

  const sectionsContext: ArticleSections = { goToSection: (id) => goToSection(id) };
  const goToLine = (line: number, pointer: boolean) => void goTo(line, { pointer });

  // Entering the article: the remembered reading position (Back on Narrow), else the section the
  // address names, else the top.
  // Only once the panel's width is known: the column arrangement re-parents the text, and a
  // heading focused before that would lose focus.
  useLayoutEffect(() => {
    if (!panel || !measured) {
      return;
    }

    const remembered = scrollMemory?.get();
    if (remembered !== undefined) {
      panel.scrollTop = remembered;

      return;
    }

    if (sectionId !== undefined) {
      goToSection(sectionId, true);
    } else {
      panel.scrollTo({ top: 0 });
    }
    // Only a new article or section moves the reader; the callbacks are recreated every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, measured, doc.documentId, sectionId]);

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
  const lead = doc.proposal ? <InlineNote>{t('docs.article.proposalNote')}</InlineNote> : null;
  const text = (
    <>
      <MarkdownDocument
        source={body}
        sourceLines
        diagrams
        labels={markdownLabels}
        renderLink={renderers.renderLink}
        renderImage={renderers.renderImage}
      />
      <RelatedDocuments related={doc.related} docsRoot={tree.docsRoot} />
    </>
  );

  return (
    <ArticleSectionsContext.Provider value={sectionsContext}>
      <AppContent className="h-full w-full">
        <ScrollArea
          direction="both"
          className="min-h-0 flex-1"
          contentClassName="p-6"
          viewportRef={setPanel}
        >
          <DocumentReadingColumns
            panelWidth={panelWidth}
            lead={lead}
            text={
              column ? (
                text
              ) : (
                <>
                  <DocumentProperties properties={properties} />
                  {text}
                </>
              )
            }
            aside={
              column ? (
                <>
                  <DocumentProperties properties={properties} anchored={false} />
                  <DocumentOutline
                    headings={headings}
                    activeLine={activeLine}
                    onSelect={goToLine}
                  />
                </>
              ) : undefined
            }
          />
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
