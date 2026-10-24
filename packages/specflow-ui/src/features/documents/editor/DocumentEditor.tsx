import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, MarkdownDocument, ScrollArea } from '@nevo/ui';
import { apiErrorCode } from '../../../shared/http/apiErrorCode';
import { documentKindOf, documentViewOf } from '../content-kinds/documentContentKinds';
import { MarkdownSourceEditor } from './MarkdownSourceEditor';
import { useDocumentEditor } from './DocumentEditorProvider';
import { restoreWhileIdle, trackUserScroll, type ScrollAnchor } from './documentScrollAnchor';
import { DocumentOutline } from '../outline/DocumentOutline';
import type { DocumentOutlineData, OutlineNavigator } from '../outline/outlineData';
import { outlineColumnMinWidth, outlineColumnWidth } from '../outline/markdownOutline';
import { DocumentProperties } from '../frontmatter/DocumentProperties';
import { useMarkdownLabels } from '../useMarkdownLabels';
import { applyPreviewAnchor, readPreviewAnchor } from './previewScroll';

/** Document content (preview or source). Identity and actions live in the workspace header. */
export function DocumentEditor() {
  const { t } = useTranslation();
  const session = useDocumentEditor();
  if (!session) return null;
  const { document, draft, editorRoot, save, setDraft } = session;
  const kind = documentKindOf(document.path);
  const plainText = kind.id === 'text';
  return (
    <div ref={editorRoot} className="flex h-full min-h-0 w-full flex-col">
      {session.saveError !== undefined && (
        <Alert
          tone="attention"
          role="alert"
          title={
            apiErrorCode(session.saveError) === 'DOCUMENT_REVISION_CONFLICT'
              ? t('documents.editor.conflict')
              : t('documents.editor.saveFailed')
          }
        />
      )}
      {documentViewOf(kind, draft) === 'edit' ? (
        <MarkdownSourceEditor
          key={document.id}
          plainText={plainText}
          value={draft.content}
          viewState={draft.viewState}
          onViewStateChange={(viewState) => setDraft({ viewState })}
          anchor={session.anchor}
          onAnchorChange={session.rememberAnchor}
          readerRef={session.anchorReader}
          onChange={(content) => setDraft({ content })}
          onSave={() => void save()}
          label={t('documents.editor.sourceLabel', { name: document.path })}
        />
      ) : (
        <PreviewScroller
          key={document.id}
          content={draft.content}
          anchor={session.anchor}
          onAnchorChange={session.rememberAnchor}
          readerRef={session.anchorReader}
          outline={session.outline}
          navigatorRef={session.outlineNavigator}
          reportColumnShown={session.reportColumnShown}
        />
      )}
    </div>
  );
}

const lineCountOf = (text: string) => text.split('\n').length;

/** The rendered preview: one scroller whose position is the shared anchor of the document. */
function PreviewScroller({
  content,
  anchor,
  onAnchorChange,
  readerRef,
  outline,
  navigatorRef,
  reportColumnShown,
}: {
  content: string;
  anchor?: ScrollAnchor;
  onAnchorChange: (anchor: ScrollAnchor) => void;
  readerRef: { current: (() => ScrollAnchor | undefined) | null };
  outline: DocumentOutlineData;
  navigatorRef: { current: OutlineNavigator | null };
  reportColumnShown: (shown: boolean | undefined) => void;
}) {
  const markdownLabels = useMarkdownLabels();
  const { t } = useTranslation();
  // Preview only: the raw `---` block is hidden and shown as read-only properties (`outline.body`).
  // Edit mode never reaches this view, so the source stays unchanged there.
  const { headings, properties, body } = outline;
  const viewport = useRef<HTMLDivElement | null>(null);
  // The panel decides the layout (measured), so the same document reads right in any pane width.
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const [panelWidth, setPanelWidth] = useState(0);
  const [activeLine, setActiveLine] = useState<number>();
  const wide = panelWidth >= outlineColumnMinWidth;
  const hasAside = headings.length > 0 || properties !== undefined;
  const latest = useRef({ content, anchor, onAnchorChange });
  useLayoutEffect(() => {
    latest.current = { content, anchor, onAnchorChange };
  });
  useLayoutEffect(() => {
    const scroller = viewport.current;
    if (!scroller) return;
    const lines = () => lineCountOf(latest.current.content);
    const read = () => readPreviewAnchor(scroller, lines());
    readerRef.current = read;
    const initial = latest.current.anchor;
    const cancelRestore = initial
      ? restoreWhileIdle(scroller, () => applyPreviewAnchor(scroller, initial, lines()), 3)
      : undefined;
    const stop = trackUserScroll(scroller, read, (next) => latest.current.onAnchorChange(next));
    return () => {
      cancelRestore?.();
      stop();
      if (readerRef.current === read) readerRef.current = null;
    };
  }, [readerRef]);
  const viewportRef = useCallback((node: HTMLDivElement | null) => {
    viewport.current = node;
    node?.setAttribute('data-document-preview', '');
    setPanel(node);
  }, []);
  useLayoutEffect(() => {
    if (!panel) return;
    const measure = () => setPanelWidth(panel.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [panel]);
  // The panel tells the header whether the contents are already a column (then no sheet is offered).
  useLayoutEffect(() => {
    reportColumnShown(wide);
    return () => reportColumnShown(undefined);
  }, [wide, reportColumnShown]);
  const headingElement = useCallback(
    (line: number) =>
      viewport.current?.querySelector<HTMLElement>(
        `:is(h1, h2, h3, h4)[data-source-line="${line}"]`,
      ) ?? null,
    [],
  );
  const pinned = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!panel) return;
    const release = () => {
      pinned.current = undefined;
    };
    // Reading on by hand ends the choice; scrolling done by the choice itself does not.
    const events = ['wheel', 'touchmove', 'keydown'] as const;
    for (const name of events) panel.addEventListener(name, release, { passive: true });
    return () => {
      for (const name of events) panel.removeEventListener(name, release);
    };
  }, [panel]);
  // The heading the reader is at: the last one that has reached the top of the panel.
  const measureActive = useCallback(() => {
    const scroller = viewport.current;
    if (!scroller) return undefined;
    // At the very end the last section is the one being read, even if its heading never reaches the top.
    // A heading the reader chose stays current until the next manual scroll, even when a short last
    // section cannot be scrolled up to the top and the end of the document wins otherwise.
    if (pinned.current !== undefined) return pinned.current;
    const scrollable = scroller.scrollHeight - scroller.clientHeight > 2;
    if (scrollable && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2)
      return headings.at(-1)?.line;
    const top = scroller.getBoundingClientRect().top + 48;
    let current: number | undefined;
    for (const heading of headings) {
      const element = headingElement(heading.line);
      if (element && element.getBoundingClientRect().top <= top) current = heading.line;
    }
    return current ?? headings[0]?.line;
  }, [headings, headingElement]);
  // A wide panel keeps the column current while reading; a narrow one measures once, when the sheet opens.
  useEffect(() => {
    if (!panel || !wide || headings.length === 0) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      setActiveLine(measureActive());
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    panel.addEventListener('scroll', schedule, { passive: true });
    return () => {
      panel.removeEventListener('scroll', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [panel, wide, headings, measureActive]);
  const goToHeading = useCallback(
    (line: number, pointer = false) => {
      const scroller = viewport.current;
      const element = headingElement(line);
      if (!scroller || !element) return;
      // A deliberate move: the shared reading position follows it like a user scroll.
      scroller.dispatchEvent(new Event('wheel'));
      scroller.scrollTop +=
        element.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16;
      scroller.dispatchEvent(new Event('scroll'));
      element.tabIndex = -1;
      // A marker for the heading just reached: after a pointer its ring is dropped (a class of the
      // preview), after the keyboard the browser's own focus ring stays.
      viewport.current?.querySelector('[data-quiet-focus]')?.removeAttribute('data-quiet-focus');
      element.setAttribute('data-quiet-focus', pointer ? 'pointer' : 'keyboard');
      // The tint fades by itself (Web Animations, no timer to clean up) unless motion is reduced.
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
        element.animate?.(
          [
            { backgroundColor: 'var(--color-surface-selected)' },
            { backgroundColor: 'transparent' },
          ],
          { duration: 600, easing: 'ease-out' },
        );
      element.addEventListener('blur', () => element.removeAttribute('data-quiet-focus'), {
        once: true,
      });
      element.focus({ preventScroll: true });
      pinned.current = line;
      setActiveLine(line);
    },
    [headingElement],
  );
  // The session offers these to the header icon, the menu item and the sheet.
  useLayoutEffect(() => {
    const navigator = { goTo: goToHeading, activeLine: measureActive };
    navigatorRef.current = navigator;
    return () => {
      if (navigatorRef.current === navigator) navigatorRef.current = null;
    };
  }, [navigatorRef, goToHeading, measureActive]);
  const text = <MarkdownDocument labels={markdownLabels} source={body} sourceLines />;
  return (
    <ScrollArea
      direction="both"
      className="min-h-0 flex-1"
      // The ring of a heading reached with a pointer is dropped (the browser would draw it).
      contentClassName="p-6 [&_[data-quiet-focus=pointer]]:outline-none"
      // The focusable scroll viewport is the preview region the editor provider refocuses.
      viewportRef={viewportRef}
    >
      {wide && hasAside ? (
        // Two columns: the text keeps its readable measure and the contents and properties stay in
        // view beside it, so a wide panel is not an empty band.
        <div className="flex items-start gap-8">
          <div className="min-w-0 max-w-content-narrow flex-1">{text}</div>
          <aside
            aria-label={t('documents.outline.columnLabel')}
            className="sticky top-0 grid shrink-0 grid-cols-1 gap-4"
            style={{ width: outlineColumnWidth(panelWidth) }}
          >
            {properties && <DocumentProperties properties={properties} anchored={false} />}
            {headings.length > 0 && (
              <DocumentOutline headings={headings} activeLine={activeLine} onSelect={goToHeading} />
            )}
          </aside>
        </div>
      ) : (
        // A readable measure (about 80 characters) aligned with the tabs; the editor keeps the full width.
        <div className="max-w-content-narrow">
          {properties && <DocumentProperties properties={properties} />}
          {text}
        </div>
      )}
    </ScrollArea>
  );
}
