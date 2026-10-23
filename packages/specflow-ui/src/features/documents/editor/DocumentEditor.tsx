import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, MarkdownDocument, ScrollArea } from '@nevo/ui';
import { apiErrorCode } from '../../../shared/http/apiErrorCode';
import { documentKindOf, documentViewOf } from '../content-kinds/documentContentKinds';
import { MarkdownSourceEditor } from './MarkdownSourceEditor';
import { useDocumentEditor } from './DocumentEditorProvider';
import { restoreWhileIdle, trackUserScroll, type ScrollAnchor } from './documentScrollAnchor';
import { DocumentOutline } from '../outline/DocumentOutline';
import { markdownOutline, outlineColumnMinWidth } from '../outline/markdownOutline';
import { DocumentProperties } from '../frontmatter/DocumentProperties';
import { parseFrontmatter } from '../frontmatter/frontmatter';
import { useMarkdownLabels } from '../useMarkdownLabels';
import { applyPreviewAnchor, readPreviewAnchor } from './previewScroll';

/** Document content (preview or source). Identity and actions live in the workspace header. */
export function DocumentEditor() {
  const { t } = useTranslation();
  const session = useDocumentEditor();
  if (!session) return null;
  const { document, draft, editorRoot, save, setDraft } = session;
  const kind = documentKindOf(document.filename ?? document.title);
  const plainText = kind.id === 'text';
  return (
    <div ref={editorRoot} className="flex h-full min-h-0 w-full flex-col">
      {session.saveError !== undefined && (
        <Alert
          tone="attention"
          role="alert"
          title={
            apiErrorCode(session.saveError) === 'demo_document_revision_conflict'
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
          label={t('documents.editor.sourceLabel', { name: document.filename ?? document.title })}
        />
      ) : (
        <PreviewScroller
          key={document.id}
          content={draft.content}
          anchor={session.anchor}
          onAnchorChange={session.rememberAnchor}
          readerRef={session.anchorReader}
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
}: {
  content: string;
  anchor?: ScrollAnchor;
  onAnchorChange: (anchor: ScrollAnchor) => void;
  readerRef: { current: (() => ScrollAnchor | undefined) | null };
}) {
  const markdownLabels = useMarkdownLabels();
  // Preview only: the raw `---` block is hidden and shown as read-only properties. Edit mode never
  // reaches this view, so the source stays unchanged there.
  const frontmatter = useMemo(() => parseFrontmatter(content), [content]);
  const viewport = useRef<HTMLDivElement | null>(null);
  // The panel decides the layout (measured), so the same document reads right in any pane width.
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const [panelWidth, setPanelWidth] = useState(0);
  const [activeLine, setActiveLine] = useState<number>();
  const headings = useMemo(() => {
    const found = markdownOutline(frontmatter ? frontmatter.body : content);
    // One heading is not a list worth showing.
    return found.length >= 2 ? found : [];
  }, [content, frontmatter]);
  const properties = frontmatter?.properties;
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
  const headingElement = (line: number) =>
    viewport.current?.querySelector<HTMLElement>(
      `:is(h1, h2, h3, h4)[data-source-line="${line}"]`,
    ) ?? null;
  // The current heading while reading: the last one that has reached the top of the panel.
  useEffect(() => {
    if (!panel || !wide || headings.length === 0) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = panel.getBoundingClientRect().top + 48;
      let current: number | undefined;
      for (const heading of headings) {
        const element = headingElement(heading.line);
        if (element && element.getBoundingClientRect().top <= top) current = heading.line;
      }
      setActiveLine(current ?? headings[0]?.line);
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
  }, [panel, wide, headings]);
  const goToHeading = (line: number) => {
    const scroller = viewport.current;
    const element = headingElement(line);
    if (!scroller || !element) return;
    // A deliberate move: the shared reading position follows it like a user scroll.
    scroller.dispatchEvent(new Event('wheel'));
    scroller.scrollTop +=
      element.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16;
    scroller.dispatchEvent(new Event('scroll'));
    element.tabIndex = -1;
    element.focus({ preventScroll: true });
    setActiveLine(line);
  };
  const text = (
    <MarkdownDocument
      labels={markdownLabels}
      source={frontmatter ? frontmatter.body : content}
      sourceLines
    />
  );
  return (
    <ScrollArea
      direction="both"
      className="min-h-0 flex-1"
      contentClassName="p-6"
      // The focusable scroll viewport is the preview region the editor provider refocuses.
      viewportRef={viewportRef}
    >
      {wide && hasAside ? (
        // Two columns: the text keeps its readable measure and the contents and properties stay in
        // view beside it, so a wide panel is not an empty band.
        <div className="flex items-start gap-10">
          <div className="min-w-0 max-w-content-narrow flex-1">{text}</div>
          <aside className="sticky top-0 grid w-80 shrink-0 gap-4">
            {properties && <DocumentProperties properties={properties} anchored={false} />}
            {headings.length > 0 && (
              <DocumentOutline
                headings={headings}
                variant="column"
                activeLine={activeLine}
                onSelect={goToHeading}
              />
            )}
          </aside>
        </div>
      ) : (
        // A readable measure (about 80 characters) aligned with the tabs; the editor keeps the full width.
        <div className="max-w-content-narrow">
          {properties && <DocumentProperties properties={properties} />}
          {headings.length > 0 && (
            <DocumentOutline headings={headings} variant="collapsible" onSelect={goToHeading} />
          )}
          {text}
        </div>
      )}
    </ScrollArea>
  );
}
