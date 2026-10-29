// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpecFlowAppServices } from '../services';
import { TestServicesRouterContext } from '../../test-support/app/TestServicesRouterContext';
import { createSpecFlowQueryClient } from './queryClient';
import { useRuntimeInfo, useRuntimeMode } from './useRuntimeMode';

afterEach(cleanup);

function Mode() {
  return <p data-testid="mode">{useRuntimeMode()}</p>;
}

function Info() {
  return <p data-testid="info">{useRuntimeInfo().isError ? 'failed' : 'ok'}</p>;
}

function renderWith(getInfo: () => Promise<{ dataMode: 'project' | 'demo' }>) {
  const services = createSpecFlowAppServices({ runtimeInfoApi: { getInfo } });

  return render(
    <QueryClientProvider client={createSpecFlowQueryClient()}>
      <TestServicesRouterContext services={services}>
        <Mode />
        <Info />
      </TestServicesRouterContext>
    </QueryClientProvider>,
  );
}

describe('useRuntimeMode', () => {
  it('is loading until the Runtime answers, then its data mode', async () => {
    renderWith(() => Promise.resolve({ dataMode: 'project' }));
    expect(screen.getByTestId('mode').textContent).toBe('loading');
    await waitFor(() => expect(screen.getByTestId('mode').textContent).toBe('project'));
  });

  it('is unavailable (never a guessed mode) when the read fails, and does not retry on its own', async () => {
    const getInfo = vi.fn(() => Promise.reject(new Error('down')));
    renderWith(getInfo);
    await waitFor(() => expect(screen.getByTestId('mode').textContent).toBe('unavailable'));
    expect(screen.getByTestId('info').textContent).toBe('failed');
    expect(getInfo).toHaveBeenCalledTimes(1);
  });

  it('shares one request between every reader of the key', async () => {
    const getInfo = vi.fn(() => Promise.resolve({ dataMode: 'demo' as const }));
    renderWith(getInfo);
    await waitFor(() => expect(screen.getByTestId('mode').textContent).toBe('demo'));
    expect(getInfo).toHaveBeenCalledTimes(1);
  });
});
