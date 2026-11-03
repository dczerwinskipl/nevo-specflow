import { EditorView } from '@codemirror/view';
import {
  clamp01,
  clampAnchor,
  ratioOf,
  restoreWhileIdle,
  sameAnchor,
  trackUserScroll,
  type ScrollAnchor,
} from './documentScrollAnchor';

export interface SourceViewState {
  anchor: number;
  head: number;
  scrollTop: number;
  scrollLeft: number;
  scrollSnapshot?: ReturnType<EditorView['scrollSnapshot']>;
}

export interface SourceScrollOwner {
  /** Hands the caret and scroll back once, right before the view goes. */
  onViewStateChange?: (state: SourceViewState) => void;
  onAnchorChange?: (anchor: ScrollAnchor) => void;
  readerRef?: { current: (() => ScrollAnchor | undefined) | null };
}

export function sourceViewStateOf(editor: EditorView): SourceViewState {
  return {
    anchor: editor.state.selection.main.anchor,
    head: editor.state.selection.main.head,
    scrollTop: editor.scrollDOM.scrollTop,
    scrollLeft: editor.scrollDOM.scrollLeft,
    scrollSnapshot: editor.scrollSnapshot(),
  };
}

/**
 * A document source's scrolling: restores where it was read (the anchor shared with the preview,
 * or the editor's own last scroll), tracks the reading anchor while the user scrolls, keeps the
 * caret visible when the mobile keyboard shrinks the viewport. Returns the undo, which also hands
 * the caret and snapshot back to the owner once.
 */
export function attachSourceScroll(
  editor: EditorView,
  initial: ScrollAnchor | undefined,
  restoredState: SourceViewState | undefined,
  owner: () => SourceScrollOwner,
) {
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
    if (next.line === undefined) {
      scroller.scrollTop = next.ratio * (scroller.scrollHeight - scroller.clientHeight);
    } else if (next.line === 1 && next.offset === 0) {
      scroller.scrollTop = 0;
    } else {
      const block = editor.lineBlockAt(editor.state.doc.line(next.line).from);
      // Round up: a fractional scrollTop floors into the previous line.
      scroller.scrollTop = Math.ceil(
        block.top + next.offset * block.height + editor.documentPadding.top,
      );
    }
  };

  // The editor estimates the heights of lines it has not measured yet (wrapped lines above the
  // target): the restore re-applies until the view reads back the target.
  const target = initial && clampAnchor(initial, editor.state.doc.lines);
  const cancelRestore = target
    ? restoreWhileIdle(
        scroller,
        () => applyAnchor(target),
        () => sameAnchor(readAnchor(), target),
      )
    : undefined;
  const restore = requestAnimationFrame(() => {
    if (!initial && restoredState && !restoredState.scrollSnapshot) {
      editor.scrollDOM.scrollTop = restoredState.scrollTop;
      editor.scrollDOM.scrollLeft = restoredState.scrollLeft;
    }
  });
  const stopTracking = trackUserScroll(scroller, readAnchor, (next) =>
    owner().onAnchorChange?.(next),
  );
  // The mobile keyboard shrinks the visual viewport: keep the caret visible, never move the anchor.
  let heightBefore = scroller.clientHeight;
  const keepCaretVisible = () => {
    const before = heightBefore;
    heightBefore = scroller.clientHeight;
    if (!editor.hasFocus) {
      return;
    }

    // A caret that was off screen stays there: it scrolls into view at the first keystroke.
    const caret = editor.lineBlockAt(editor.state.selection.main.head);
    const top = caret.top + editor.documentPadding.top;
    if (top + caret.height < scroller.scrollTop || top > scroller.scrollTop + before) {
      return;
    }

    editor.dispatch({
      effects: EditorView.scrollIntoView(editor.state.selection.main.head, {
        y: 'nearest',
        yMargin: 24,
      }),
    });
  };

  window.visualViewport?.addEventListener('resize', keepCaretVisible);
  const reader = owner().readerRef;
  if (reader) {
    reader.current = readAnchor;
  }

  return () => {
    cancelAnimationFrame(restore);
    cancelRestore?.();
    stopTracking();
    window.visualViewport?.removeEventListener('resize', keepCaretVisible);
    // Scrolling is persisted as the shared anchor (a ref, no re-render); the caret and snapshot are
    // handed over once, right before the mode changes or the editor unmounts.
    owner().onViewStateChange?.(sourceViewStateOf(editor));
    if (reader?.current === readAnchor) {
      reader.current = null;
    }
  };
}
