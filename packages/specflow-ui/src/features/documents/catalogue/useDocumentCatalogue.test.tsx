// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeInfoResponse } from '@nevo/specflow-contracts/runtime';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import type { DocumentsApi } from '../api';
import { useDocumentCatalogue } from './useDocumentCatalogue';

afterEach(cleanup);

const catalogue = { revision: 'r', archetypes: [] };

function harness(info: Promise<RuntimeInfoResponse>) {
  const project = vi.fn(() => Promise.resolve(catalogue));
  const demo = vi.fn(() => Promise.resolve(catalogue));
  const services = createSpecFlowAppServices({
    runtimeInfoApi: { getInfo: () => info },
    projectDocumentsApi: { catalogue: project } as unknown as DocumentsApi,
    demoDocumentsApi: { catalogue: demo } as unknown as DocumentsApi,
  });
  const client = createSpecFlowQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <TestServicesRouterContext services={services}>{children}</TestServicesRouterContext>
    </QueryClientProvider>
  );
  renderHook(() => useDocumentCatalogue(), { wrapper });

  return { project, demo };
}

describe('the document archetype catalogue', () => {
  it('asks no adapter while the Runtime mode is still being read', async () => {
    const { project, demo } = harness(new Promise<never>(() => undefined));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(project).not.toHaveBeenCalled();
    expect(demo).not.toHaveBeenCalled();
  });

  it('asks only the project Runtime once it reports project mode', async () => {
    const { project, demo } = harness(
      Promise.resolve({ dataMode: 'project' } as unknown as RuntimeInfoResponse),
    );

    await waitFor(() => expect(project).toHaveBeenCalledTimes(1));
    expect(demo).not.toHaveBeenCalled();
  });
});
