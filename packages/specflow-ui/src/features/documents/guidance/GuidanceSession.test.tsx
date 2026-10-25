// @vitest-environment jsdom
import { documentContentFixture } from '../../../../test-support/documents/fixtures';
import type { DocumentContent } from '@nevo/specflow-contracts/documents';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import type { DocumentGuidance } from '../catalogue/documentTypePolicy';
import { DocumentDraftProvider } from '../editor/DocumentDraftProvider';
import {
  DocumentEditorProvider,
  useDocumentEditor,
  type DocumentEditorSession,
} from '../editor/DocumentEditorProvider';
import { documentHeaderModel } from '../editor/documentHeaderModel';
import { createDocumentDraftStore } from '../editor/documentDraftStore';
import { GuidanceButton } from './GuidanceButton';

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
});
afterEach(cleanup);

const research: DocumentGuidance = {
  title: 'Research',
  description: 'Evidence behind the decisions.',
  useWhen: 'Use when a claim needs a source.',
  // Markup in the catalogue text stays text; indentation and line breaks are kept.
  instructions: ['Start with the question.\n  - <b>cite</b> every source'],
};
const record = (id = 'a'): DocumentContent =>
  documentContentFixture({
    id,
    title: id,
    path: `${id}.md`,
    type: 'research',
    content: '# A',
    revision: '1',
  });

function setup(guidance: DocumentGuidance | null = research) {
  const services = createSpecFlowAppServices();
  const queryClient = createSpecFlowQueryClient();
  const seen: {
    session: DocumentEditorSession | null;
    actions: { id: string; checked?: boolean }[];
  } = { session: null, actions: [] };
  function Probe() {
    const session = useDocumentEditor();
    const { t } = useTranslation();
    seen.session = session;
    seen.actions = documentHeaderModel(session, t).actions.map((action) => ({
      id: action.id,
      checked: action.checked,
    }));
    return <GuidanceButton />;
  }
  const store = createDocumentDraftStore();
  const tree = (shown: DocumentContent, shownGuidance = guidance ?? undefined) => (
    <QueryClientProvider client={queryClient}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('pl')}>
          <DocumentDraftProvider store={store}>
            <DocumentEditorProvider specId="s" document={shown} guidance={shownGuidance}>
              <Probe />
            </DocumentEditorProvider>
          </DocumentDraftProvider>
        </LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
  const view = render(tree(record()));
  return Object.assign(seen, {
    show: (next: DocumentContent) => view.rerender(tree(next)),
  });
}
const toggle = () => screen.queryByRole('button', { name: 'Wskazówki' });

describe('the writing guidance of a document', () => {
  it('is offered only for a document whose type has guidance', () => {
    const seen = setup(null);
    expect(toggle()).toBeNull();
    expect(seen.actions.map((action) => action.id)).not.toContain('document-guidance');
  });

  it('opens as a sheet on a narrow panel: the type, plain text with whitespace kept, focus back on close', async () => {
    const seen = setup();
    act(() => seen.session!.reportGuidanceColumnFits(false));
    const button = toggle()!;
    expect(button.getAttribute('aria-pressed')).toBe('false');
    button.focus();
    fireEvent.click(button);
    const sheet = await screen.findByRole('dialog', { name: 'Wskazówki' });
    expect(within(sheet).getByText('Jak pisać: Research')).toBeTruthy();
    expect(within(sheet).getByText('Evidence behind the decisions.')).toBeTruthy();
    expect(within(sheet).getByText('Use when a claim needs a source.')).toBeTruthy();
    const instructions = within(sheet).getByText(/Start with the question\./);
    // Never HTML: the tag is text, and the whitespace is preserved by the style.
    expect(instructions.textContent).toBe('Start with the question.\n  - <b>cite</b> every source');
    expect(instructions.querySelector('b')).toBeNull();
    expect(instructions.className).toContain('whitespace-pre-wrap');
    expect(seen.actions.find((action) => action.id === 'document-guidance')?.checked).toBe(true);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Zamknij wskazówki' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(toggle()));
    expect(toggle()!.getAttribute('aria-pressed')).toBe('false');
  });

  it('is a column on a wide panel, kept per document for the visit', () => {
    const seen = setup();
    act(() => seen.session!.reportGuidanceColumnFits(true));
    fireEvent.click(toggle()!);
    expect(seen.session!.guidanceShown).toBe('column');
    expect(toggle()!.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('dialog')).toBeNull();
    // Another tab: closed there; back: still open.
    seen.show(record('b'));
    act(() => seen.session!.reportGuidanceColumnFits(true));
    expect(seen.session!.guidanceShown).toBeUndefined();
    seen.show(record('a'));
    act(() => seen.session!.reportGuidanceColumnFits(true));
    expect(seen.session!.guidanceShown).toBe('column');
    fireEvent.click(toggle()!);
    expect(seen.session!.guidanceShown).toBeUndefined();
  });

  it('does not pop up as a sheet when a column panel turns narrow', () => {
    const seen = setup();
    act(() => seen.session!.reportGuidanceColumnFits(true));
    fireEvent.click(toggle()!);
    act(() => seen.session!.reportGuidanceColumnFits(false));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(seen.session!.guidanceShown).toBeUndefined();
    // Wide again: the column the reader chose is back.
    act(() => seen.session!.reportGuidanceColumnFits(true));
    expect(seen.session!.guidanceShown).toBe('column');
  });
});
