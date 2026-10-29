// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef, type RefObject } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { createDocumentDraftStore } from './documentDraftStore';
import { DocumentDraftProvider } from './DocumentDraftProvider';
import { DocumentEditorProvider } from './DocumentEditorProvider';
import { DocumentTabsProvider } from '../tabs/DocumentTabsProvider';
import { DocumentRouteGuard } from './DocumentRouteGuard';

afterEach(cleanup);

const SPEC = 'spec';

function setup() {
  const store = createDocumentDraftStore();
  store.set(SPEC, 'a', { content: 'mine', baseline: 'disk', revision: 'a1', editing: true });
  const leave: RefObject<(() => Promise<boolean>) | null> = createRef();
  const take: RefObject<(() => string[]) | null> = createRef();
  const view = render(
    <QueryClientProvider client={createSpecFlowQueryClient()}>
      <TestServicesRouterContext services={createSpecFlowAppServices()}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <DocumentDraftProvider store={store}>
            <DocumentEditorProvider specId={SPEC}>
              <DocumentTabsProvider specId={SPEC}>
                <DocumentRouteGuard specId={SPEC} requestRef={leave} takeDiscardedRef={take} />
              </DocumentTabsProvider>
            </DocumentEditorProvider>
          </DocumentDraftProvider>
        </LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>,
  );
  return { store, leave, take, view };
}

describe('agreeing to discard for a tree operation', () => {
  it('only hands the drafts over: nothing is removed until the asker removes it', async () => {
    const { store, leave, take, view } = setup();
    let answer: Promise<boolean> | undefined;
    act(() => {
      answer = leave.current!();
    });
    await act(async () => {
      fireEvent.click(await screen.findByText('Discard all'));
    });
    await expect(answer).resolves.toBe(true);
    // The user then cancels the Move dialog (the asker never removes them): the text is kept.
    expect(take.current!()).toEqual(['a']);
    expect(store.get(SPEC, 'a')?.content).toBe('mine');
    // Handed over once: the guard leaving the screen does not remove them either.
    expect(take.current!()).toEqual([]);
    view.unmount();
    expect(store.get(SPEC, 'a')?.content).toBe('mine');
  });
});
