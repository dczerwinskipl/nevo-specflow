// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorFocus } from './useEditorFocus';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A document view with a preview and a spy on where focus lands. */
function mountPreview(root: HTMLDivElement | null) {
  const preview = document.createElement('div');
  preview.setAttribute('data-document-preview', '');
  preview.tabIndex = -1;
  root?.append(preview);
  return vi.spyOn(preview, 'focus');
}

describe('useEditorFocus', () => {
  it('moves focus into the preview only after the mode switch has rendered (two frames)', () => {
    const { result } = renderHook(() => useEditorFocus());
    result.current.editorRoot.current = document.createElement('div');
    const focus = mountPreview(result.current.editorRoot.current);
    result.current.focusContentSoon();
    act(() => {
      vi.advanceTimersByTime(17);
    });
    expect(focus).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(17);
    });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('drops a scheduled focus when the view unmounts first', () => {
    const { result, unmount } = renderHook(() => useEditorFocus());
    result.current.editorRoot.current = document.createElement('div');
    const focus = mountPreview(result.current.editorRoot.current);
    result.current.focusContentSoon();
    unmount();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(focus).not.toHaveBeenCalled();
  });

  it('does nothing without an editor root', () => {
    const { result } = renderHook(() => useEditorFocus());
    expect(() => {
      result.current.focusContent();
      result.current.focusEditor();
    }).not.toThrow();
  });
});
