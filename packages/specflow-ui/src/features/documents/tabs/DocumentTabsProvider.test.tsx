// @vitest-environment jsdom
import {
  documentContentFixture,
  documentTreeFixture,
} from '../../../../test-support/documents/fixtures';
import type { DocumentContent } from '@nevo/specflow-contracts/documents';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { DocumentDraftProvider } from '../editor/DocumentDraftProvider';
import {
  useDocumentEditor,
  useDocumentSaveOwner,
  useDocumentSession,
} from '../editor/DocumentEditorProvider';
import type { DocumentSaveOwner } from '../editor/useDocumentSave';
import { createDocumentDraftStore, draftFor } from '../editor/documentDraftStore';
import type { DocumentApi, DocumentsApi } from '../api';
import { DocumentTabsProvider, useDocumentRecord } from './DocumentTabsProvider';

/** Every save carries a fresh `operationId` (idempotency key). */
const anyOperationId: unknown = expect.any(String);

const SPEC = 'spec';
const record = (id: string, content: string, revision: string): DocumentContent =>
  documentContentFixture({ id, title: id, path: `${id}.md`, content, revision });

function setup(documentId: string | undefined, strict = false, treeFails = false) {
  const docs: Record<string, DocumentContent> = {
    a: record('a', 'A0', 'a1'),
    b: record('b', 'B0', 'b1'),
  };
  const getDocument = vi.fn((_spec: string, id: string) => Promise.resolve(docs[id]!));
  const save = vi.fn(() => Promise.resolve({ document: { revision: 'b2' } }));
  const services = createSpecFlowAppServices({
    documentApi: { getDocument } as unknown as DocumentApi,
    demoDocumentsApi: {
      documentTree: () =>
        treeFails
          ? Promise.reject(new Error('Tree unavailable'))
          : Promise.resolve(
              documentTreeFixture({
                revision: 't',
                documents: [
                  { id: 'a', path: 'docs/a.md' },
                  { id: 'b', path: 'docs/b.md' },
                ],
              }),
            ),
      save,
    } as unknown as DocumentsApi,
  });
  const store = createDocumentDraftStore();
  const queryClient = createSpecFlowQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  const seen: { ops?: DocumentSaveOwner; sessionOfB?: unknown; sessionOfA?: unknown } = {};
  function Probe() {
    const session = useDocumentEditor();
    const state = useDocumentRecord();
    seen.ops = useDocumentSaveOwner();
    seen.sessionOfA = useDocumentSession('a');
    seen.sessionOfB = useDocumentSession('b');

    return (
      <output data-testid="probe">{`${session?.document.id ?? '-'}|${state?.documentId ?? '-'}|${state?.query.status ?? '-'}`}</output>
    );
  }

  const tree = (
    <QueryClientProvider client={queryClient}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <DocumentDraftProvider store={store}>
            <DocumentTabsProvider specId={SPEC} documentId={documentId}>
              <Probe />
            </DocumentTabsProvider>
          </DocumentDraftProvider>
        </LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
  render(strict ? <StrictMode>{tree}</StrictMode> : tree);

  return { getDocument, save, store, seen, docs };
}

afterEach(cleanup);

describe('DocumentTabsProvider', () => {
  it('loads the shown document once and shares it between the record state and the session', async () => {
    const t = setup('a');
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('a|a|success'));
    expect(t.getDocument).toHaveBeenCalledTimes(1);
    expect(t.seen.sessionOfA).not.toBeNull();
    // A document that is not on screen has no session of its own.
    expect(t.seen.sessionOfB).toBeNull();
  });

  it('opens the document when the tree read fails instead of waiting for it forever', async () => {
    const t = setup('a', false, true);
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('a|a|success'));
    expect(t.getDocument).toHaveBeenCalledTimes(1);
  });

  it('loads nothing without a route document', () => {
    const t = setup(undefined);
    expect(screen.getByTestId('probe').textContent).toBe('-|-|-');
    expect(t.getDocument).not.toHaveBeenCalled();
  });

  it('saves the draft of a document that is not on screen', async () => {
    const t = setup('a');
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('a|a|success'));
    t.store.set(SPEC, 'b', { ...draftFor(t.docs.b!), content: 'B1' });
    const result = await act(() => t.seen.ops!.save('b'));
    expect(result).toMatchObject({ ok: true, documentId: 'b', content: 'B1' });
    expect(t.save).toHaveBeenCalledWith(SPEC, 'b', {
      operationId: anyOperationId,
      content: 'B1',
      expectedRevision: 'b1',
    });
    expect(t.store.get(SPEC, 'b')).toMatchObject({ baseline: 'B1', revision: 'b2' });
  });
});
