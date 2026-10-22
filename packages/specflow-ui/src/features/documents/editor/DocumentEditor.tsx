import { useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, MarkdownDocument, ScrollArea } from '@nevo/ui';
import { apiErrorCode } from '../../../shared/http/apiErrorCode';
import { MarkdownSourceEditor } from './MarkdownSourceEditor';
import { useDocumentEditor } from './DocumentEditorProvider';
import { restoreWhileIdle, trackUserScroll, type ScrollAnchor } from './documentScrollAnchor';
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
  const plainText = Boolean(document.filename?.toLowerCase().endsWith('.txt'));
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
      {draft.editing ? (
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
          plainText={plainText}
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
  plainText,
  anchor,
  onAnchorChange,
  readerRef,
}: {
  content: string;
  plainText: boolean;
  anchor?: ScrollAnchor;
  onAnchorChange: (anchor: ScrollAnchor) => void;
  readerRef: { current: (() => ScrollAnchor | undefined) | null };
}) {
  const markdownLabels = useMarkdownLabels();
  // Preview only: the raw `---` block is hidden and shown as read-only properties. Edit mode never
  // reaches this view, so the source stays unchanged there.
  const frontmatter = useMemo(
    () => (plainText ? null : parseFrontmatter(content)),
    [content, plainText],
  );
  const viewport = useRef<HTMLDivElement | null>(null);
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
  return (
    <ScrollArea
      direction="both"
      className="min-h-0 flex-1"
      contentClassName="p-6"
      // The focusable scroll viewport is the preview region the editor provider refocuses.
      viewportRef={(node) => {
        viewport.current = node;
        node?.setAttribute('data-document-preview', '');
      }}
    >
      {plainText ? (
        <pre className="whitespace-pre-wrap break-words text-body-sm">{content}</pre>
      ) : (
        <>
          {frontmatter && <DocumentProperties properties={frontmatter.properties} />}
          <MarkdownDocument
            labels={markdownLabels}
            source={frontmatter ? frontmatter.body : content}
            sourceLines
          />
        </>
      )}
    </ScrollArea>
  );
}
