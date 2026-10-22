import { QueryClientProvider } from '@tanstack/react-query';
import { HttpClientError } from '@nevo/http-client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { documentKeys } from '../read-model/queries';
import { DocumentContent } from './DocumentContent';

function renderDocument({
  status,
  id = 'doc',
  revision = 'r1',
  expectedRevision = 'r1',
  network = false,
  timeout = false,
}: {
  status?: number;
  id?: string;
  revision?: string;
  expectedRevision?: string;
  network?: boolean;
  timeout?: boolean;
} = {}) {
  const client = createSpecFlowQueryClient();
  const key = documentKeys.detail('spec', 'doc', expectedRevision);
  client.setQueryData(key, { id, revision, title: 'Document', content: 'Protected document body' });
  if (status || network || timeout)
    client
      .getQueryCache()
      .find({ queryKey: key, exact: true })!
      .setState({
        status: 'error',
        error: new HttpClientError('Refresh failed', {
          kind: timeout ? 'timeout' : network ? 'network' : 'http',
          status,
        }),
        fetchStatus: 'idle',
      });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <TestServicesRouterContext services={createSpecFlowAppServices()}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <DocumentContent specId="spec" documentId="doc" expectedRevision={expectedRevision} />
        </LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>,
  );
}

describe('query-facing Document content retention', () => {
  it.each([500, 502, 503])('retains matching content after transient HTTP %s', (status) => {
    const html = renderDocument({ status });
    expect(html).toContain('Protected document body');
    expect(html).toContain('Retry');
    expect(html).toContain('role="status"');
  });
  it('retains matching content after a network failure', () =>
    expect(renderDocument({ network: true })).toContain('Protected document body'));
  it('retains matching content after a timeout (the client reports it apart from a network failure)', () =>
    expect(renderDocument({ timeout: true })).toContain('Protected document body'));
  it.each([400, 401, 403, 404, 409, 422])(
    'removes retained content on blocking HTTP %s',
    (status) => {
      const html = renderDocument({ status });
      expect(html).not.toContain('Protected document body');
      expect(html).toContain('role="alert"');
    },
  );
  it.each([
    { id: 'other' },
    { revision: 'r0' },
    { status: 503, id: 'other' },
    { status: 503, revision: 'r0' },
  ])('rejects mismatched content before retention: %j', (options) => {
    expect(renderDocument(options)).not.toContain('Protected document body');
  });
  it('shows a matching cached entry immediately without a placeholder', () => {
    const html = renderDocument();
    expect(html).toContain('Protected document body');
    expect(html).not.toContain('data-loading-shape');
    expect(html).not.toContain('initial-content-appearance');
  });
});
