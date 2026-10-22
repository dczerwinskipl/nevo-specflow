import { EditorView } from '@codemirror/view';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Focus choreography of the open document: where the editor lives, moving focus into the source
 * editor or the preview, and doing so after the next render(s). Scheduled frames are cancelled when
 * the document view unmounts, so a late frame never focuses (or throws on) a view that is gone.
 */
export function useEditorFocus() {
  const editorRoot = useRef<HTMLDivElement | null>(null);
  const frames = useRef(new Set<number>());

  const focusEditor = useCallback(() => {
    const element = editorRoot.current?.querySelector<HTMLElement>('.cm-editor');
    if (element) EditorView.findFromDOM(element)?.focus();
  }, []);
  const focusContent = useCallback(() => {
    // The header action that changed the mode may be replaced or disabled; keep focus in the document.
    const root = editorRoot.current;
    if (root?.querySelector('.cm-editor')) {
      // Touch: focusing the editor raises the keyboard and jumps the view; the user taps the text.
      if (window.matchMedia('(pointer: coarse)').matches)
        root.querySelector<HTMLElement>('[data-document-source]')?.focus({ preventScroll: true });
      else focusEditor();
    } else
      root?.querySelector<HTMLElement>('[data-document-preview]')?.focus({ preventScroll: true });
  }, [focusEditor]);

  /** Runs `action` after `count` animation frames, unless the view unmounts first. */
  const after = useCallback((count: number, action: () => void) => {
    const step = (remaining: number) => {
      const id = requestAnimationFrame(() => {
        frames.current.delete(id);
        if (remaining > 1) step(remaining - 1);
        else action();
      });
      frames.current.add(id);
    };
    step(count);
  }, []);
  useEffect(() => {
    const pending = frames.current;
    return () => {
      pending.forEach((id) => cancelAnimationFrame(id));
      pending.clear();
    };
  }, []);

  return {
    editorRoot,
    focusEditor,
    focusContent,
    /** After the next frame (a header action's own focus handling has finished). */
    focusEditorSoon: useCallback(() => after(1, focusEditor), [after, focusEditor]),
    /** After the mode switch has rendered (two frames). */
    focusContentSoon: useCallback(() => after(2, focusContent), [after, focusContent]),
  };
}
