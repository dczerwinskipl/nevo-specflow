import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import {
  clamp01,
  clampAnchor,
  ratioOf,
  restoreWhileIdle,
  trackUserScroll,
  type ScrollAnchor,
} from './documentScrollAnchor';

const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--color-content-link)', fontWeight: '600' },
  { tag: tags.list, color: 'var(--color-content-link-hover)' },
  {
    tag: tags.monospace,
    color: 'color-mix(in srgb, var(--color-content-link) 65%, var(--color-content-primary))',
    backgroundColor: 'var(--color-surface-selected)',
  },
  { tag: tags.processingInstruction, color: 'var(--color-content-muted)' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: [tags.link, tags.url], color: 'var(--color-content-link)', textDecoration: 'underline' },
]);
export function MarkdownSourceEditor({
  value,
  onChange,
  onSave,
  label,
  plainText = false,
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
  viewState?: {
    anchor: number;
    head: number;
    scrollTop: number;
    scrollLeft: number;
    scrollSnapshot?: ReturnType<EditorView['scrollSnapshot']>;
  };
  /** Where the document was last read (shared with the preview); restored once after mounting. */
  anchor?: ScrollAnchor;
  onAnchorChange?: (anchor: ScrollAnchor) => void;
  /** Lets the owner read the current anchor synchronously, e.g. right before a mode change. */
  readerRef?: MutableRefObject<(() => ScrollAnchor | undefined) | null>;
  onViewStateChange?: (state: {
    anchor: number;
    head: number;
    scrollTop: number;
    scrollLeft: number;
    scrollSnapshot?: ReturnType<EditorView['scrollSnapshot']>;
  }) => void;
}) {
  const mount = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null);
  const emittedValues = useRef(new Set<string>()),
    applyingExternal = useRef(false);
  const callbacks = useRef({ onChange, onSave, onViewStateChange });
  useLayoutEffect(() => {
    callbacks.current = { onChange, onSave, onViewStateChange };
  });
  const anchorRef = useRef(anchor);
  const anchorCallbacks = useRef({ onAnchorChange, readerRef });
  useLayoutEffect(() => {
    anchorCallbacks.current = { onAnchorChange, readerRef };
  });
  useEffect(() => {
    const initial = anchorRef.current;
    const editor = new EditorView({
      parent: mount.current!,
      scrollTo: initial ? undefined : viewState?.scrollSnapshot,
      state: EditorState.create({
        doc: value,
        selection: viewState
          ? {
              anchor: Math.min(viewState.anchor, value.length),
              head: Math.min(viewState.head, value.length),
            }
          : initial?.line !== undefined
            ? // First time in edit mode: the caret starts on the line being read, so it is in view.
              { anchor: lineStart(value, initial.line) }
            : undefined,
        extensions: [
          // Editable source looks like an editor: a line-number gutter and the current line marked.
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          ...(plainText ? [] : [markdown(), syntaxHighlighting(markdownHighlight)]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': label, tabindex: '0' }),
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
            if (update.selectionSet || update.docChanged)
              callbacks.current.onViewStateChange?.({
                anchor: update.state.selection.main.anchor,
                head: update.state.selection.main.head,
                scrollTop: update.view.scrollDOM.scrollTop,
                scrollLeft: update.view.scrollDOM.scrollLeft,
                scrollSnapshot: update.view.scrollSnapshot(),
              });
            if (update.docChanged && !applyingExternal.current) {
              const text = update.state.doc.toString();
              emittedValues.current.add(text);
              callbacks.current.onChange(text);
            }
          }),
          EditorView.theme(
            {
              // The surface (field fill, border, radius, focus border) belongs to the mount element, so the
              // editable area reads like the DS text fields and differs from the page.
              '&': {
                height: '100%',
                backgroundColor: 'transparent',
                color: 'var(--color-content-primary)',
              },
              '.cm-cursor, .cm-dropCursor': {
                borderLeftColor: 'var(--color-content-primary)',
              },
              '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground':
                { background: 'color-mix(in srgb, var(--color-content-link) 32%, transparent)' },
              '.cm-scroller': {
                overflow: 'auto',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-code-md)',
                lineHeight: 'var(--text-code-md--line-height)',
              },
              // Same inner padding as the DS text area (control-padding-default); CodeMirror's own
              // line padding is dropped so there is a single inset layer, not three.
              '.cm-content': { padding: 'var(--spacing-control-padding-default)' },
              '.cm-line': { padding: '0' },
              '.cm-gutters': {
                backgroundColor: 'transparent',
                color: 'var(--color-content-muted)',
                border: 'none',
                // A gutter hairline would be a second frame inside the field: none.
                paddingLeft: 'var(--spacing-control-padding-default)',
              },
              // At least two digits wide, so the gutter does not jump from line 9 to 10.
              '.cm-lineNumbers .cm-gutterElement': { minWidth: '2ch', padding: '0 8px 0 0' },
              '.cm-activeLine, .cm-activeLineGutter': {
                backgroundColor:
                  'color-mix(in srgb, var(--color-surface-selected) 55%, transparent)',
              },
              '.cm-activeLineGutter': { color: 'var(--color-content-primary)' },
              // The visible focus indicator is the focus-ring border of the editor mount, no extra frame.
              '&.cm-focused': { outline: 'none' },
            },
            { dark: true },
          ),
        ],
      }),
    });
    view.current = editor;
    const remember = () =>
      callbacks.current.onViewStateChange?.({
        anchor: editor.state.selection.main.anchor,
        head: editor.state.selection.main.head,
        scrollTop: editor.scrollDOM.scrollTop,
        scrollLeft: editor.scrollDOM.scrollLeft,
        scrollSnapshot: editor.scrollSnapshot(),
      });
    const scroller = editor.scrollDOM;
    const readAnchor = (): ScrollAnchor => {
      const padding = editor.documentPadding.top;
      const top = Math.max(0, scroller.scrollTop - padding);
      const block = editor.lineBlockAtHeight(top);
      return {
        line: editor.state.doc.lineAt(block.from).number,
        offset: block.height > 0 ? clamp01((top - block.top) / block.height) : 0,
        ratio: ratioOf(scroller.scrollTop, scroller.scrollHeight, scroller.clientHeight),
      };
    };
    const applyAnchor = (raw: ScrollAnchor) => {
      const next = clampAnchor(raw, editor.state.doc.lines);
      if (next.line === undefined)
        scroller.scrollTop = next.ratio * (scroller.scrollHeight - scroller.clientHeight);
      else if (next.line === 1 && next.offset === 0) scroller.scrollTop = 0;
      else {
        const block = editor.lineBlockAt(editor.state.doc.line(next.line).from);
        // Round up: a fractional scrollTop floors into the previous line.
        scroller.scrollTop = Math.ceil(
          block.top + next.offset * block.height + editor.documentPadding.top,
        );
      }
    };
    const cancelRestore = initial
      ? restoreWhileIdle(scroller, () => applyAnchor(initial), 3)
      : undefined;
    const restore = requestAnimationFrame(() => {
      if (!initial && viewState && !viewState.scrollSnapshot) {
        editor.scrollDOM.scrollTop = viewState.scrollTop;
        editor.scrollDOM.scrollLeft = viewState.scrollLeft;
      }
    });
    const stopTracking = trackUserScroll(scroller, readAnchor, (next) =>
      anchorCallbacks.current.onAnchorChange?.(next),
    );
    // The mobile keyboard shrinks the visual viewport: keep the caret visible, never move the anchor.
    let heightBefore = scroller.clientHeight;
    const keepCaretVisible = () => {
      const before = heightBefore;
      heightBefore = scroller.clientHeight;
      if (!editor.hasFocus) return;
      // A caret that was off screen stays there: it scrolls into view at the first keystroke.
      const caret = editor.lineBlockAt(editor.state.selection.main.head);
      const top = caret.top + editor.documentPadding.top;
      if (top + caret.height < scroller.scrollTop || top > scroller.scrollTop + before) return;
      editor.dispatch({
        effects: EditorView.scrollIntoView(editor.state.selection.main.head, {
          y: 'nearest',
          yMargin: 24,
        }),
      });
    };
    window.visualViewport?.addEventListener('resize', keepCaretVisible);
    const reader = anchorCallbacks.current.readerRef;
    if (reader) reader.current = readAnchor;
    return () => {
      cancelAnimationFrame(restore);
      cancelRestore?.();
      stopTracking();
      window.visualViewport?.removeEventListener('resize', keepCaretVisible);
      // Scrolling is persisted as the shared anchor (a ref, no re-render); the caret and snapshot are
      // handed over once, right before the mode changes or the editor unmounts.
      remember();
      if (reader?.current === readAnchor) reader.current = null;
      editor.destroy();
      view.current = null;
    };
    // The editor is created once per mode and label: the initial text and view state are read at
    // creation, and later value changes are synchronised by the effect below, so they must not
    // rebuild (and reset) the CodeMirror view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plainText, label]);
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    // Delayed React acknowledgements must not replace newer CodeMirror keystrokes.
    if (emittedValues.current.has(value)) {
      if (editor.state.doc.toString() === value) emittedValues.current.clear();
      else emittedValues.current.delete(value);
      return;
    }
    if (editor.state.doc.toString() !== value) {
      applyingExternal.current = true;
      try {
        editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
      } finally {
        applyingExternal.current = false;
      }
    }
  }, [value]);
  return (
    <div
      ref={mount}
      data-document-source=""
      tabIndex={-1}
      className="m-2 min-h-0 flex-1 overflow-hidden rounded-control border border-solid border-border-default bg-surface-control has-[:focus-visible]:border-focus-ring"
    />
  );
}

function lineStart(text: string, line: number) {
  let from = 0;
  for (let current = 1; current < line; current++) {
    const next = text.indexOf('\n', from);
    if (next === -1) return from;
    from = next + 1;
  }
  return from;
}
