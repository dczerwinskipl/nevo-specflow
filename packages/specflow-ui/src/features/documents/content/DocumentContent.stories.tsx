import type { DocumentContent as DocumentRecord } from '@nevo/specflow-contracts/documents';
import { documentContentFixture } from '../../../../test-support/documents/fixtures';
import { useMemo, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { QueryClientProvider } from '@tanstack/react-query';
import { HttpClientError } from '@nevo/http-client';
import {
  AppShell,
  AppWorkspace,
  AppContent,
  AppWorkspaceBody,
  Button,
  WorkspaceHeader,
} from '@nevo/ui';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { documentKeys } from '../read-model/queries';
import { DocumentContent } from './DocumentContent';

function DocumentLifecycle({
  cached = false,
  stress = false,
}: {
  cached?: boolean;
  stress?: boolean;
}) {
  const requests = useRef(
    new Map<string, { resolve: (data: DocumentRecord) => void; reject: (error: Error) => void }>(),
  );
  const [id, setId] = useState('doc-a');
  const response = (documentId: string): DocumentRecord =>
    documentContentFixture({
      id: documentId,
      title: 'Reading document',
      revision: 'r1',
      content: `# Reading ${documentId}\n\nContinue reading this protected content.\n\n${stress ? Array.from({ length: 18 }, () => 'Long paragraph describing independently continuing work, authorization and revision consistency. '.repeat(5)).join('\n\n') : 'Another paragraph remains mounted during refresh.'}`,
    });
  const client = useMemo(() => {
    const result = createSpecFlowQueryClient();
    result.setDefaultOptions({ queries: { retry: false, staleTime: Infinity } });
    if (cached) {
      result.setQueryData(documentKeys.detail('spec', 'doc-a', 'r1'), response('doc-a'));
    }

    return result;
    // The fixture's initial cache is deliberately fixed at mount.
  }, []);
  const services = useMemo(
    () =>
      createSpecFlowAppServices({
        documentApi: {
          getDocument: (_specId, documentId) =>
            new Promise((resolve, reject) => {
              requests.current.set(documentId, { resolve, reject });
            }),
        },
      }),
    [],
  );
  const settle = (documentId: string, status?: number) => {
    const request = requests.current.get(documentId);
    if (!request) {
      throw new Error('Expected document request');
    }

    if (status) {
      request.reject(new HttpClientError('Fixture response', { kind: 'http', status }));
    } else {
      request.resolve(response(documentId));
    }
  };

  return (
    <QueryClientProvider client={client}>
      <TestServicesRouterContext services={services}>
        <StoryLocalization locale="en">
          <div className="h-dvh">
            <AppShell navigation={<div>Specification</div>}>
              <AppWorkspace split="primary">
                <AppWorkspace.Primary header={<WorkspaceHeader title="Document" />}>
                  <AppContent className="w-content-standard max-w-full">
                    <AppWorkspaceBody scroll="area" contentClassName="py-6">
                      <div
                        className="mb-4 flex flex-wrap gap-2"
                        aria-label="Document test controls"
                      >
                        <Button size="sm" onClick={() => settle(id)}>
                          Resolve document
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            void client.refetchQueries({
                              queryKey: documentKeys.detail('spec', id, 'r1'),
                            })
                          }
                        >
                          Refresh document
                        </Button>
                        <Button size="sm" onClick={() => settle(id, 503)}>
                          Fail refresh
                        </Button>
                        <Button size="sm" onClick={() => settle(id, 403)}>
                          Deny access
                        </Button>
                        <Button size="sm" onClick={() => setId('doc-b')}>
                          Open B
                        </Button>
                        <Button size="sm" onClick={() => settle('doc-a')}>
                          Resolve A late
                        </Button>
                      </div>
                      <DocumentContent specId="spec" documentId={id} expectedRevision="r1" />
                    </AppWorkspaceBody>
                  </AppContent>
                </AppWorkspace.Primary>
              </AppWorkspace>
            </AppShell>
          </div>
        </StoryLocalization>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'SpecFlow/Features/Documents/Content lifecycle',
  component: DocumentLifecycle,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof DocumentLifecycle>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {};
export const LongContent: Story = { args: { cached: true, stress: true } };
export const Cached: Story = {
  args: { cached: true },
  tags: ['contract'],
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByText('Continue reading this protected content.');
    await expect(canvasElement.querySelector('[data-loading-shape]')).toBeNull();
    await expect(canvasElement.querySelector('.initial-content-appearance')).toBeNull();
  },
};
export const RetentionAndAccessLoss: Story = {
  tags: ['integration'],
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole('status', { name: 'Loading document…' });
    await userEvent.click(canvas.getByRole('button', { name: 'Resolve document' }));
    const paragraph = await canvas.findByText('Continue reading this protected content.');
    const owner = paragraph.parentElement!.parentElement!;
    await expect(owner.classList.contains('initial-content-appearance')).toBe(true);
    await expect(getComputedStyle(owner).animationName).toBe(
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'none'
        : 'initial-content-appearance',
    );
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await expect(getComputedStyle(owner).animationDuration).toBe('0.15s');
    }

    await userEvent.click(canvas.getByRole('button', { name: 'Refresh document' }));
    await expect(canvas.getByText('Continue reading this protected content.')).toBe(paragraph);
    await userEvent.click(canvas.getByRole('button', { name: 'Fail refresh' }));
    await canvas.findByRole('button', { name: 'Retry' });
    await expect(canvas.getByText('Continue reading this protected content.')).toBe(paragraph);
    await expect(canvasElement.querySelector('[data-loading-shape]')).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Retry' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Deny access' }));
    await canvas.findByRole('alert');
    await expect(canvas.queryByText('Continue reading this protected content.')).toBeNull();
  },
};
export const ChangedIdentityIgnoresLateResult: Story = {
  tags: ['integration'],
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole('status', { name: 'Loading document…' });
    await userEvent.click(canvas.getByRole('button', { name: 'Open B' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Resolve A late' }));
    await expect(canvas.queryByRole('heading', { name: 'Reading doc-a' })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Resolve document' }));
    await waitFor(
      async () =>
        await expect(canvas.getByRole('heading', { name: 'Reading doc-b' })).toBeVisible(),
    );
  },
};
