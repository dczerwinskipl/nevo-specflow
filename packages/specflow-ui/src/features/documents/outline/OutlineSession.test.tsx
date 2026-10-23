// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import type { SpecificationDocumentResponse } from '@nevo/specflow-contracts/specs/workspace';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { DocumentDraftProvider } from '../editor/DocumentDraftProvider';
import { DocumentEditorProvider, useDocumentEditor } from '../editor/DocumentEditorProvider';
import type { DocumentEditorSession } from '../editor/DocumentEditorProvider';
import { documentHeaderModel } from '../editor/documentHeaderModel';
import { OutlineButton } from './OutlineButton';

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
  window.scrollTo = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});
afterEach(cleanup);

const markdown = ['# One', '', 'text', '', '## Two', '', '### Three', '', 'end'].join('\n');
const record = (content: string, filename = 'a.md'): SpecificationDocumentResponse => ({
  id: 'a',
  title: 'a',
  filename,
  content,
  revision: '1',
});

function setup(document: SpecificationDocumentResponse) {
  const services = createSpecFlowAppServices();
  const queryClient = createSpecFlowQueryClient();
  const seen: { session: DocumentEditorSession | null; actions: string[]; groups: string[] } = {
    session: null,
    actions: [],
    groups: [],
  };
  function Probe() {
    const session = useDocumentEditor();
    const { t } = useTranslation();
    seen.session = session;
    const actions = documentHeaderModel(session, t).actions;
    seen.actions = actions.map((action) => action.id);
    seen.groups = actions.map((action) => String(action.group));
    return <OutlineButton />;
  }
  render(
    <QueryClientProvider client={queryClient}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <DocumentDraftProvider>
            <DocumentEditorProvider specId="s" document={document}>
              <Probe />
            </DocumentEditorProvider>
          </DocumentDraftProvider>
        </LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>,
  );
  return seen;
}
const icon = () => screen.queryByRole('button', { name: 'Open contents' });

describe('the contents of a previewed document', () => {
  it('offers the icon and the first Display menu item in a panel without a contents column', () => {
    const seen = setup(record(markdown));
    expect(icon()).toBeNull();
    act(() => seen.session!.reportColumnShown(false));
    expect(icon()).not.toBeNull();
    expect(seen.actions[0]).toBe('document-outline');
    expect(seen.groups[0]).toBe('display');
    expect(icon()!.getAttribute('aria-haspopup')).toBe('dialog');
    expect(icon()!.getAttribute('aria-expanded')).toBe('false');
  });

  it('offers neither on a wide panel (the column is there) nor before the preview reports', () => {
    const seen = setup(record(markdown));
    expect(seen.actions).not.toContain('document-outline');
    act(() => seen.session!.reportColumnShown(true));
    expect(icon()).toBeNull();
    expect(seen.actions).not.toContain('document-outline');
  });

  it('offers neither while editing', () => {
    const seen = setup(record(markdown));
    act(() => seen.session!.reportColumnShown(false));
    act(() => seen.session!.setDraft({ editing: true }));
    expect(icon()).toBeNull();
    expect(seen.actions).not.toContain('document-outline');
    act(() => seen.session!.setDraft({ editing: false }));
    expect(icon()).not.toBeNull();
  });

  it('offers neither for fewer than two headings, plain text or an empty document', () => {
    for (const document of [
      record('# Only one\n\ntext'),
      record('# One\n\n## Two', 'notes.txt'),
      record(''),
    ]) {
      const seen = setup(document);
      act(() => seen.session!.reportColumnShown(false));
      expect(icon()).toBeNull();
      expect(seen.actions).not.toContain('document-outline');
      cleanup();
    }
  });

  it('opens a sheet with the headings, marks the current one and goes to the chosen one', async () => {
    const seen = setup(record(markdown));
    const goTo = vi.fn();
    seen.session!.outlineNavigator.current = { goTo, activeLine: () => 5 };
    act(() => seen.session!.reportColumnShown(false));
    fireEvent.click(icon()!);
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Contents (3)')).toBeTruthy();
    const nav = within(sheet).getByRole('navigation', { name: 'Contents' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['One', 'Two', 'Three']);
    expect(links.map((link) => link.getAttribute('aria-current'))).toEqual([
      null,
      'location',
      null,
    ]);
    // The page behind a modal sheet is hidden from the accessibility tree: ask for it explicitly.
    expect(
      screen
        .getByRole('button', { name: 'Open contents', hidden: true })
        .getAttribute('aria-expanded'),
    ).toBe('true');
    fireEvent.click(links[2]!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(goTo).toHaveBeenCalledWith(7));
  });

  it('closes without going anywhere on Escape', async () => {
    const seen = setup(record(markdown));
    const goTo = vi.fn();
    seen.session!.outlineNavigator.current = { goTo, activeLine: () => 1 };
    act(() => seen.session!.reportColumnShown(false));
    fireEvent.click(icon()!);
    const sheet = await screen.findByRole('dialog');
    fireEvent.keyDown(sheet, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(goTo).not.toHaveBeenCalled();
  });
});
