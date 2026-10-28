import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, InlineNote, MarkdownDocument, ScrollArea } from '@nevo/ui';
import { useMessage } from '../../../i18n/message';
import { apiErrorCode } from '../../../shared/http/apiErrorCode';
import { readOnlyLine, reasonFragment, reasonRemedy } from '../catalogue/documentTypePolicy';
import { documentKindOf, documentViewOf } from '../content-kinds/documentContentKinds';
import { DocumentFileView, DocumentImageView } from '../content/DocumentFileViews';
import { refusalReason } from '../explorer/useDocumentOperations';
import { MarkdownSourceEditor } from './MarkdownSourceEditor';
import {
  useDocumentEditor,
  type DocumentEditorSession,
  type GuidanceRoom,
} from './DocumentEditorProvider';
import {
  clampAnchor,
  restoreWhileIdle,
  sameAnchor,
  trackUserScroll,
  type ScrollAnchor,
} from './documentScrollAnchor';
import { DocumentOutline } from '../outline/DocumentOutline';
import type { DocumentOutlineData, OutlineNavigator } from '../outline/outlineData';
import {
  guidanceColumnMinWidth,
  guidanceColumnWidth,
  outlineColumnMinWidth,
  outlineColumnWidth,
} from '../outline/markdownOutline';
import type { DocumentGuidance } from '../catalogue/documentTypePolicy';
import { DocumentGuidanceColumn } from '../guidance/DocumentGuidance';
import { DocumentProperties } from '../frontmatter/DocumentProperties';
import { useMarkdownLabels } from '../useMarkdownLabels';
import { applyPreviewAnchor, readPreviewAnchor } from './previewScroll';

/**
 * Why the document is read-only, as the first quiet line of its content (on open, in the reading
 * order before the text): the reason and, when there is one, what to do about it.
 */
function ReadOnlyLine({ session }: { session: DocumentEditorSession }) {
  const text = useMessage();
  const reason = session.readOnlyReason;
  if (!reason) return null;
  const remedy = reasonRemedy(reason);
  return (
    <InlineNote>
      {text(readOnlyLine(reason, 'document'))}
      {remedy ? ` ${text(remedy)}` : ''}
    </InlineNote>
  );
}

/**
 * A refused save, at the top of the document (role alert, focus stays in the editor). The draft
 * is always kept; the actions are the ways out of each refusal.
 */
function SaveRefusal({ session }: { session: DocumentEditorSession }) {
  const { t } = useTranslation();
  const text = useMessage();
  if (session.saveError === undefined) return null;
  const code = apiErrorCode(session.saveError);
  const name = session.document.path.split('/').at(-1) ?? session.document.path;
  const tryAgain = (
    <Button
      size="sm"
      variant="secondary"
      disabled={session.saving}
      onClick={() => void session.save()}
    >
      {t('documents.save.tryAgain')}
    </Button>
  );
  let title: string;
  let body: ReactNode = null;
  let actions: ReactNode = null;
  switch (code) {
    case 'DOCUMENT_REVISION_CONFLICT':
      title = t('documents.conflict.title', { name });
      body = t('documents.conflict.body');
      actions = (
        <>
          <Button size="sm" variant="secondary" onClick={session.copyMine}>
            {t('documents.conflict.copyMine')}
          </Button>
          <Button size="sm" variant="secondary" onClick={session.requestLoadDisk}>
            {t('documents.conflict.loadDisk')}
          </Button>
        </>
      );
      break;
    case 'BRANCH_PROTECTED':
    case 'GIT_POLICY_INVALID':
    case 'SPEC_ARCHIVED': {
      const reason = refusalReason(session.saveError, code);
      const remedy = reasonRemedy(reason);
      title = t('documents.save.refused', { reason: text(reasonFragment(reason)) });
      body = remedy ? text(remedy) : null;
      break;
    }
    case 'COMMIT_BLOCKED':
      title = t('documents.save.commitBlocked');
      body = t('documents.remedy.commitBlocked');
      actions = tryAgain;
      break;
    case 'SPEC_BUSY':
      title = t('documents.save.busy');
      actions = tryAgain;
      break;
    case 'DOCUMENT_RECOVERY_REQUIRED':
      title = t('documents.save.recoveryTitle');
      body = t('documents.save.recoveryBody');
      actions = (
        <Button size="sm" variant="secondary" disabled={session.saving} onClick={session.resume}>
          {t('documents.save.resume')}
        </Button>
      );
      break;
    case 'DOCUMENT_FILE_MISSING':
      title = t('documents.save.missing');
      body = t('documents.tabs.missingHint');
      break;
    default:
      title = t('documents.save.failed');
      actions = tryAgain;
  }
  return (
    <div className="shrink-0 px-4 pt-4">
      <Alert role="alert" tone="attention" title={title} actions={actions}>
        {body && <p>{body}</p>}
      </Alert>
    </div>
  );
}

/** Measures the width of an element (0 until it is mounted). */
function useWidth(element: HTMLElement | null) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return width;
}

/** Document content (preview, source, image or file). Identity and actions live in the workspace header. */
export function DocumentEditor() {
  const session = useDocumentEditor();
  if (!session) return null;
  return <DocumentContentView session={session} />;
}

function DocumentContentView({ session }: { session: DocumentEditorSession }) {
  const { t } = useTranslation();
  const { document, draft, editorRoot, save, setDraft, reportGuidanceRoom } = session;
  const kind = documentKindOf(document);
  const plainText = kind.id === 'text';
  const view = documentViewOf(kind, draft, session.readOnlyReason !== undefined);
  const readOnlyLine = kind.text ? <ReadOnlyLine session={session} /> : null;
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const rootRef = useCallback(
    (node: HTMLDivElement | null) => {
      editorRoot.current = node;
      setRoot(node);
    },
    [editorRoot],
  );
  const width = useWidth(root);
  // The source editor keeps at least 960 px beside the guidance column, so it is a column there only
  // from the two-column threshold; otherwise the guidance opens as a sheet. The preview reports its
  // own room (it measures its panel), images and files have none.
  const sourceView = view === 'edit' || view === 'source';
  const sourceFits = sourceView && width >= guidanceColumnMinWidth;
  useLayoutEffect(() => {
    if (view === 'preview') return;
    reportGuidanceRoom(sourceFits ? 'beside' : undefined);
    return () => reportGuidanceRoom(undefined);
  }, [view, sourceFits, reportGuidanceRoom]);
  // The source editor tells the session the class of its pane: Wrap lines is a choice per class.
  const sourcePane =
    !sourceView || width === 0 ? undefined : width < outlineColumnMinWidth ? 'narrow' : 'wide';
  const { reportSourcePane } = session;
  useLayoutEffect(() => {
    reportSourcePane(sourcePane);
    return () => reportSourcePane(undefined);
  }, [sourcePane, reportSourcePane]);
  const guidance = session.guidanceShown === 'column' ? session.guidance : undefined;
  return (
    <div ref={rootRef} className="flex h-full min-h-0 w-full flex-col">
      <SaveRefusal session={session} />
      {view === 'image' ? (
        <DocumentImageView
          specId={session.specId}
          document={document}
          actualSize={session.actualSize}
        />
      ) : view === 'file' ? (
        <DocumentFileView document={document} onDownload={session.download} />
      ) : view === 'edit' || view === 'source' ? (
        <SourceWithGuidance guidance={guidance} width={width}>
          {session.readOnlyReason && <div className="shrink-0 px-4 pb-1 pt-3">{readOnlyLine}</div>}
          <MarkdownSourceEditor
            key={document.id}
            plainText={plainText}
            // Read-only text, or editing locked until a written save is resumed.
            readOnly={view === 'source' || session.locked}
            wrapLines={session.wrapLines?.checked ?? true}
            value={draft.content}
            viewState={draft.viewState}
            onViewStateChange={(viewState) => setDraft({ viewState })}
            anchor={session.anchor}
            onAnchorChange={session.rememberAnchor}
            readerRef={session.anchorReader}
            onChange={(content) => setDraft({ content })}
            // Ctrl/Cmd+S does nothing while a save runs (it joins it) or when Save is blocked.
            onSave={() => {
              if (!session.saveBlocked) void save();
            }}
            label={t('documents.editor.sourceLabel', { name: document.path })}
          />
        </SourceWithGuidance>
      ) : (
        <PreviewScroller
          key={document.id}
          lead={session.readOnlyReason ? readOnlyLine : undefined}
          content={draft.content}
          anchor={session.anchor}
          onAnchorChange={session.rememberAnchor}
          readerRef={session.anchorReader}
          outline={session.outline}
          navigatorRef={session.outlineNavigator}
          reportColumnShown={session.reportColumnShown}
          reportGuidanceRoom={reportGuidanceRoom}
          contentsColumnShown={session.contentsColumnShown}
          guidance={guidance}
        />
      )}
    </div>
  );
}

/**
 * The source editor keeps the full width; with the guidance column shown (only on panels where the
 * editor keeps at least 960 px) the column sits at its right edge with its own scroll.
 */
function SourceWithGuidance({
  guidance,
  width,
  children,
}: {
  guidance?: DocumentGuidance;
  width: number;
  children: ReactNode;
}) {
  if (!guidance) return <>{children}</>;
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      <DocumentGuidanceColumn
        guidance={guidance}
        width={guidanceColumnWidth(width)}
        className="shrink-0 border-l border-divider px-2 py-6"
      />
    </div>
  );
}

const lineCountOf = (text: string) => text.split('\n').length;

/** The rendered preview: one scroller whose position is the shared anchor of the document. */
function PreviewScroller({
  lead,
  content,
  anchor,
  onAnchorChange,
  readerRef,
  outline,
  navigatorRef,
  reportColumnShown,
  reportGuidanceRoom,
  contentsColumnShown,
  guidance,
}: {
  /** The first line of the content (for example why the document is read-only), in the flow. */
  lead?: ReactNode;
  content: string;
  anchor?: ScrollAnchor;
  onAnchorChange: (anchor: ScrollAnchor) => void;
  readerRef: { current: (() => ScrollAnchor | undefined) | null };
  outline: DocumentOutlineData;
  navigatorRef: { current: OutlineNavigator | null };
  reportColumnShown: (shown: boolean | undefined) => void;
  reportGuidanceRoom: (room: GuidanceRoom | undefined) => void;
  /** False while the shared slot holds the guidance (or the reader closed the contents there). */
  contentsColumnShown: boolean;
  /** The guidance column to show beside the text (wide panels only). */
  guidance?: DocumentGuidance;
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
  const [panelHeight, setPanelHeight] = useState(0);
  const [activeLine, setActiveLine] = useState<number>();
  const wide = panelWidth >= outlineColumnMinWidth;
  const hasAside = headings.length > 0 || properties !== undefined;
  // From the contents threshold the preview has a right-hand slot; from the two-column threshold
  // the contents and the guidance each have a column. The reading column never drops below 528 px.
  const room: GuidanceRoom | undefined =
    panelWidth >= guidanceColumnMinWidth ? 'beside' : wide ? 'shared' : undefined;
  const contents = hasAside && contentsColumnShown;
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
      ? restoreWhileIdle(
          scroller,
          () => applyPreviewAnchor(scroller, initial, lines()),
          () => sameAnchor(read(), clampAnchor(initial, lines())),
        )
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
    const measure = () => {
      setPanelWidth(panel.clientWidth);
      setPanelHeight(panel.clientHeight);
    };
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
  useLayoutEffect(() => {
    if (panelWidth === 0) return;
    reportGuidanceRoom(room);
    return () => reportGuidanceRoom(undefined);
  }, [panelWidth, room, reportGuidanceRoom]);
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
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Smooth unless motion is reduced; the chosen heading is current at once (`pinned`), so the
      // marker does not walk through the sections the scroll passes.
      scroller.scrollTo({
        top:
          scroller.scrollTop +
          element.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top -
          16,
        behavior: reduced ? 'auto' : 'smooth',
      });
      scroller.dispatchEvent(new Event('scroll'));
      element.tabIndex = -1;
      // A marker for the heading just reached: after a pointer its ring is dropped (a class of the
      // preview), after the keyboard the browser's own focus ring stays.
      viewport.current?.querySelector('[data-quiet-focus]')?.removeAttribute('data-quiet-focus');
      element.setAttribute('data-quiet-focus', pointer ? 'pointer' : 'keyboard');
      // The tint fades by itself (Web Animations, no timer to clean up) unless motion is reduced.
      if (!reduced)
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
  // The columns beside the text, each with the 32 px gap before it.
  const asideWidth =
    (contents ? outlineColumnWidth(panelWidth) + 32 : 0) +
    (guidance ? guidanceColumnWidth(panelWidth) + 32 : 0);
  return (
    <ScrollArea
      direction="both"
      className="min-h-0 flex-1"
      // The ring of a heading reached with a pointer is dropped (the browser would draw it).
      contentClassName="p-6 [&_[data-quiet-focus=pointer]]:outline-none"
      // The focusable scroll viewport is the preview region the editor provider refocuses.
      viewportRef={viewportRef}
    >
      {wide && (contents || guidance) ? (
        // The text keeps its readable measure and the contents (and the guidance) stay in view
        // beside it. The group is centred in a panel wider than itself, so the spare width becomes
        // two equal outer gutters instead of one empty band on the right.
        <div
          className="mx-auto flex items-start gap-8"
          style={{ maxWidth: `calc(var(--spacing-content-narrow) + ${asideWidth}px)` }}
        >
          <div className="min-w-0 max-w-content-narrow flex-1">
            {lead && <div className="mb-4">{lead}</div>}
            {text}
          </div>
          {contents && (
            <aside
              aria-label={t('documents.outline.columnLabel')}
              className="sticky top-0 grid shrink-0 grid-cols-1 gap-4"
              style={{ width: outlineColumnWidth(panelWidth) }}
            >
              {properties && <DocumentProperties properties={properties} anchored={false} />}
              {headings.length > 0 && (
                <DocumentOutline
                  headings={headings}
                  activeLine={activeLine}
                  onSelect={goToHeading}
                />
              )}
            </aside>
          )}
          {guidance && (
            <DocumentGuidanceColumn
              guidance={guidance}
              width={guidanceColumnWidth(panelWidth)}
              // Its own scroll inside the visible panel (less the panel's padding).
              maxHeight={Math.max(0, panelHeight - 48)}
              className="sticky top-0 shrink-0"
            />
          )}
        </div>
      ) : (
        // A readable measure (about 80 characters), centred in a pane wider than it so the spare
        // width becomes two equal gutters; the editor keeps the full width.
        <div className="mx-auto max-w-content-narrow">
          {lead && <div className="mb-4">{lead}</div>}
          {properties && <DocumentProperties properties={properties} />}
          {text}
        </div>
      )}
    </ScrollArea>
  );
}
