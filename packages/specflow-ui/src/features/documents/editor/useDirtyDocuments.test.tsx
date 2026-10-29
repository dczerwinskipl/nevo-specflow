// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { createDocumentDraftStore, type DocumentDraft } from './documentDraftStore';
import { DocumentDraftProvider, useDirtyDocuments } from './DocumentDraftProvider';

afterEach(cleanup);

const draft = (content: string): DocumentDraft => ({
  content,
  baseline: 'base',
  revision: '1',
  editing: false,
});

function setup(strict = false) {
  const store = createDocumentDraftStore();
  const wrapper = ({ children }: { children: ReactNode }) => {
    const tree = <DocumentDraftProvider store={store}>{children}</DocumentDraftProvider>;

    return strict ? <StrictMode>{tree}</StrictMode> : tree;
  };

  let renders = 0;
  const view = renderHook(
    () => {
      renders += 1;

      return useDirtyDocuments('s');
    },
    { wrapper },
  );

  return { store, view, renders: () => renders };
}

describe('useDirtyDocuments', () => {
  it('tracks dirty transitions and keeps the snapshot identity while the set is unchanged', () => {
    const { store, view, renders } = setup();
    expect(view.result.current).toEqual([]);
    act(() => store.set('s', 'a', draft('changed')));
    expect(view.result.current).toEqual(['a']);
    const stable = view.result.current;
    const before = renders();
    act(() => {
      store.set('other', 'z', draft('changed'));
      store.patch('s', 'a', { editing: true }, () => draft('changed'));
      store.set('s', 'clean', draft('base'));
    });
    expect(view.result.current).toBe(stable);
    expect(renders()).toBe(before);
    act(() => store.remove('s', 'a'));
    expect(view.result.current).toEqual([]);
  });

  it('is safe under StrictMode', () => {
    const { store, view } = setup(true);
    act(() => store.set('s', 'a', draft('changed')));
    expect(view.result.current).toEqual(['a']);
    const stable = view.result.current;
    act(() => store.set('other', 'z', draft('changed')));
    expect(view.result.current).toBe(stable);
  });
});
