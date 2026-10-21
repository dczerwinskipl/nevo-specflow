// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  useDocumentDraft,
  useDocumentDraftStore,
} from '../features/documents/editor/DocumentDraftProvider';
import { useComposerDraft } from '../features/sessions/SessionStateProvider';
import { useNotify } from '../shared/notifications/notifications';
import { VisitStateProvider } from './VisitStateProvider';

afterEach(cleanup);

const draft = (content: string) => ({ content, baseline: content, revision: '1', editing: false });

describe('visit state stores', () => {
  it('re-renders only the readers of the store entry that changed', () => {
    const renders = { a: 0, b: 0, composer: 0, actions: 0 };
    let store!: ReturnType<typeof useDocumentDraftStore>;
    let setComposer!: (message: string) => void;
    let notify!: (message: string) => void;

    function DocumentA() {
      renders.a += 1;
      return <output data-testid="a">{useDocumentDraft('s', 'a')?.content}</output>;
    }
    function DocumentB() {
      renders.b += 1;
      return <output data-testid="b">{useDocumentDraft('s', 'b')?.content}</output>;
    }
    function Composer() {
      renders.composer += 1;
      const [message, set] = useComposerDraft('s:session');
      setComposer = set;
      return <output data-testid="composer">{message}</output>;
    }
    function Actions() {
      renders.actions += 1;
      store = useDocumentDraftStore();
      notify = useNotify();
      return null;
    }

    const view = render(
      <VisitStateProvider>
        <DocumentA />
        <DocumentB />
        <Composer />
        <Actions />
      </VisitStateProvider>,
    );
    act(() => {
      store.set('s', 'a', draft('A0'));
      store.set('s', 'b', draft('B0'));
    });
    const before = { ...renders };

    // A cursor / view-state update of document A.
    act(() =>
      store.patch(
        's',
        'a',
        { viewState: { anchor: 3, head: 3, scrollTop: 10, scrollLeft: 0 } },
        () => draft('A0'),
      ),
    );
    expect(renders.a).toBe(before.a + 1);
    expect(renders.b).toBe(before.b);
    expect(renders.composer).toBe(before.composer);
    expect(renders.actions).toBe(before.actions);

    // Composer, notification and a content edit of B do not touch A or the others.
    act(() => setComposer('hello'));
    act(() => notify('saved'));
    act(() => store.patch('s', 'b', { content: 'B1' }, () => draft('B0')));
    expect(view.getByTestId('composer').textContent).toBe('hello');
    expect(view.getByTestId('b').textContent).toBe('B1');
    expect(renders.a).toBe(before.a + 1);
    expect(renders.b).toBe(before.b + 1);
    expect(renders.composer).toBe(before.composer + 1);
    expect(renders.actions).toBe(before.actions);
  });
});
