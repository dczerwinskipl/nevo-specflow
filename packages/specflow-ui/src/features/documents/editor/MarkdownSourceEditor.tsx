import { useLayoutEffect, useRef, type MutableRefObject } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { cn } from '@nevo/ui';
import { CodeView, codeSurfaceClassName, type CodeViewSetup } from '../../../shared/code-view';
import type { ScrollAnchor } from './documentScrollAnchor';
import { attachSourceScroll, sourceViewStateOf, type SourceViewState } from './sourceEditorScroll';

/**
 * A document's source on the shared code view (Markdown, or plain text), with the editor's own
 * behaviour on top: history, Ctrl/Cmd+S, the caret and scroll handed back to the owner, and the
 * reading anchor shared with the preview.
 */
export function MarkdownSourceEditor({
  value,
  onChange,
  onSave,
  label,
  plainText = false,
  readOnly = false,
  wrapLines = true,
  viewState,
  onViewStateChange,
  anchor,
  onAnchorChange,
  readerRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  label: string;
  plainText?: boolean;
  /** The text can be read, selected and copied but not changed (a read-only or locked document). */
  readOnly?: boolean;
  /** Long lines wrap at the pane edge (else the editor scrolls sideways). Changes in place. */
  wrapLines?: boolean;
  viewState?: SourceViewState;
  /** Where the document was last read (shared with the preview); restored once after mounting. */
  anchor?: ScrollAnchor;
  onAnchorChange?: (anchor: ScrollAnchor) => void;
  /** Lets the owner read the current anchor synchronously, e.g. right before a mode change. */
  readerRef?: MutableRefObject<(() => ScrollAnchor | undefined) | null>;
  onViewStateChange?: (state: SourceViewState) => void;
}) {
  const callbacks = useRef({ onSave, onViewStateChange, onAnchorChange, readerRef });
  useLayoutEffect(() => {
    callbacks.current = { onSave, onViewStateChange, onAnchorChange, readerRef };
  });
  const anchorRef = useRef(anchor);

  // Read by the code view once, when it creates the editor (once per mode and label).
  const setup = (doc: string): CodeViewSetup => {
    const initial = anchorRef.current;

    return {
      scrollTo: initial ? undefined : viewState?.scrollSnapshot,
      selection: viewState
        ? {
            anchor: Math.min(viewState.anchor, doc.length),
            head: Math.min(viewState.head, doc.length),
          }
        : initial?.line !== undefined
          ? // First time in edit mode: the caret starts on the line being read, so it is in view.
            { anchor: lineStart(doc, initial.line) }
          : undefined,
      extensions: [
        history(),
        keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              callbacks.current.onSave();

              return true;
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.selectionSet || update.docChanged) {
            callbacks.current.onViewStateChange?.(sourceViewStateOf(update.view));
          }
        }),
      ],
      attach: (editor) => attachSourceScroll(editor, initial, viewState, () => callbacks.current),
    };
  };

  return (
    <CodeView
      value={value}
      onChange={onChange}
      language={plainText ? 'plain' : 'markdown'}
      label={label}
      readOnly={readOnly}
      wrapLines={wrapLines}
      setup={setup}
      className={cn('m-2 min-h-0 flex-1 overflow-hidden', codeSurfaceClassName)}
      mountProps={{ 'data-document-source': '', tabIndex: -1 }}
    />
  );
}

function lineStart(text: string, line: number) {
  let from = 0;
  for (let current = 1; current < line; current++) {
    const next = text.indexOf('\n', from);
    if (next === -1) {
      return from;
    }

    from = next + 1;
  }

  return from;
}
