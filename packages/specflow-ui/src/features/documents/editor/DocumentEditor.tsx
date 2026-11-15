import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, InlineNote, MarkdownDocument, ScrollArea, Typography } from '@nevo/ui';
import { useMessage } from '../../../i18n/message';
import { apiErrorCode } from '../../../shared/http/apiErrorCode';
import {
  readOnlyLine,
  reasonFragment,
  reasonRemedy,
  typeTitle,
} from '../catalogue/documentTypePolicy';
import { useDocumentCatalogue } from '../catalogue/useDocumentCatalogue';
import { documentKindOf, documentViewOf } from '../content-kinds/documentContentKinds';
import { DocumentFileView, DocumentImageView } from '../content/DocumentFileViews';
import { refusalReason } from '../mutationErrors';
import { MarkdownSourceEditor } from './MarkdownSourceEditor';
import { operationRunningCode } from './useDocumentSave';
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
import { DocumentOutline } from '../../../shared/document-reading/DocumentOutline';
import type {
  DocumentOutlineData,
  OutlineNavigator,
} from '../../../shared/document-reading/outlineData';
import {
  guidanceColumnMinWidth,
  guidanceColumnWidth,
  outlineColumnMinWidth,
} from '../../../shared/document-reading/markdownOutline';
import { DocumentReadingColumns } from '../../../shared/document-reading/DocumentReadingColumns';
import { useHeadingNavigation } from '../../../shared/document-reading/useHeadingNavigation';
import { usePanelSize } from '../../../shared/document-reading/usePanelSize';
import type { DocumentGuidance } from '../catalogue/documentTypePolicy';
import { DocumentGuidanceColumn } from '../guidance/DocumentGuidance';
import { DocumentProperties } from '../../../shared/document-reading/DocumentProperties';
import { useMarkdownLabels } from '../../../i18n/useMarkdownLabels';
import { applyPreviewAnchor, readPreviewAnchor } from './previewScroll';

/**
 * Why the document is read-only, as the first quiet line of its content (on open, in the reading
 * order before the text): the reason and, when there is one, what to do about it.
 */
function ReadOnlyLine({ session }: { session: DocumentEditorSession }) {
  const text = useMessage();
  const reason = session.readOnlyReason;
  if (!reason) {
    return null;
  }

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
  if (session.saveError === undefined) {
    return null;
  }

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
    case operationRunningCode:
      title = t('documents.save.operationRunning');
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

/** Document content (preview, source, image or file). Identity and actions live in the workspace header. */
export function DocumentEditor() {
  const session = useDocumentEditor();
  if (!session) {
    return null;
  }

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
  const { width } = usePanelSize(root);
  const catalogue = useDocumentCatalogue();
  // The source editor keeps at least 960 px beside the guidance column, so it is a column there only
  // from the two-column threshold; otherwise the guidance opens as a sheet. The preview reports its
  // own room (it measures its panel), images and files have none.
  const sourceView = view === 'edit' || view === 'source';
  const sourceFits = sourceView && width >= guidanceColumnMinWidth;
  useLayoutEffect(() => {
    if (view === 'preview') {
      return;
    }

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
  // The type of a registered document, as one quiet line at the head of the document: on touch the
  // row tooltip is not reachable, and the tree may not be on screen.
  const typeLine =
    document.classification === 'registered' && document.type
      ? t('documents.tree.typeOf', { type: typeTitle(catalogue.data, document.type) })
      : undefined;

  return (
    <div ref={rootRef} className="flex h-full min-h-0 w-full flex-col">
      {typeLine && (
        <Typography
          as="p"
          variant="body-sm"
          data-document-type=""
          className="m-0 shrink-0 truncate px-4 pt-2 text-content-muted"
        >
          {typeLine}
        </Typography>
      )}
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
              if (!session.saveBlocked) {
                void save();
              }
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
  if (!guidance) {
    return <>{children}</>;
  }

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
  // Preview only: the raw `---` block is hidden and shown as read-only properties (`outline.body`).
  // Edit mode never reaches this view, so the source stays unchanged there.
  const { headings, properties, body } = outline;
  const viewport = useRef<HTMLDivElement | null>(null);
  // The panel decides the layout (measured), so the same document reads right in any pane width.
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const { width: panelWidth, height: panelHeight } = usePanelSize(panel);
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
    if (!scroller) {
      return;
    }

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
      if (readerRef.current === read) {
        readerRef.current = null;
      }
    };
  }, [readerRef]);
  const viewportRef = useCallback((node: HTMLDivElement | null) => {
    viewport.current = node;
    node?.setAttribute('data-document-preview', '');
    setPanel(node);
  }, []);
  // The panel tells the header whether the contents are already a column (then no sheet is offered).
  useLayoutEffect(() => {
    reportColumnShown(wide);

    return () => reportColumnShown(undefined);
  }, [wide, reportColumnShown]);
  useLayoutEffect(() => {
    if (panelWidth === 0) {
      return;
    }

    reportGuidanceRoom(room);

    return () => reportGuidanceRoom(undefined);
  }, [panelWidth, room, reportGuidanceRoom]);
  const { activeLine, goTo, measureActive } = useHeadingNavigation(panel, headings, { live: wide });
  // The session offers these to the header icon, the menu item and the sheet.
  useLayoutEffect(() => {
    const navigator: OutlineNavigator = {
      goTo: (line, pointer) => void goTo(line, { pointer }),
      activeLine: measureActive,
    };
    navigatorRef.current = navigator;

    return () => {
      if (navigatorRef.current === navigator) {
        navigatorRef.current = null;
      }
    };
  }, [navigatorRef, goTo, measureActive]);
  const text = <MarkdownDocument labels={markdownLabels} source={body} sourceLines />;
  const columns = wide && (contents || guidance);

  return (
    <ScrollArea
      direction="both"
      className="min-h-0 flex-1"
      contentClassName="p-6"
      // The focusable scroll viewport is the preview region the editor provider refocuses.
      viewportRef={viewportRef}
    >
      <DocumentReadingColumns
        panelWidth={panelWidth}
        lead={lead}
        text={
          columns ? (
            text
          ) : (
            <>
              {properties && <DocumentProperties properties={properties} />}
              {text}
            </>
          )
        }
        aside={
          columns && contents ? (
            <>
              {properties && <DocumentProperties properties={properties} anchored={false} />}
              {headings.length > 0 && (
                <DocumentOutline
                  headings={headings}
                  activeLine={activeLine}
                  onSelect={(line, pointer) => goTo(line, { pointer })}
                />
              )}
            </>
          ) : undefined
        }
        extraColumn={
          columns && guidance ? (
            <DocumentGuidanceColumn
              guidance={guidance}
              width={guidanceColumnWidth(panelWidth)}
              // Its own scroll inside the visible panel (less the panel's padding).
              maxHeight={Math.max(0, panelHeight - 48)}
              className="sticky top-0 shrink-0"
            />
          ) : undefined
        }
      />
    </ScrollArea>
  );
}
