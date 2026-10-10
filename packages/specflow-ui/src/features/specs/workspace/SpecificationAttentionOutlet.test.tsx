import { AppShell } from '@nevo/ui';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { UiModulesProvider } from '../../../app/ui-modules/UiModulesProvider';
import { contributeTo, type UiModule } from '../../../app/ui-modules/contracts';
import { createUiRegistry } from '../../../app/ui-modules/registry';
import { LocalizationProvider } from '../../../i18n';
import { createSpecificationWorkspaceFixture } from '../../../../test-support/specs/workspace/fixtures';
import { specificationAttentionItems } from '../extensions/specificationAttentionItems';
import { specificationWorkSections } from '../extensions/specificationWorkSections';
import { createFakeWorkspaceRuntime, WorkspaceProvider } from './WorkspaceContext';
import { WorkView } from './WorkView';

describe('Specification Attention source isolation', () => {
  it('keeps other contributions and Runtime fallback visible when one source fails', () => {
    const data = createSpecificationWorkspaceFixture('working', 'SPEC-42');
    const runtimeAttention = [
      {
        id: 'needs-task',
        kind: 'task' as const,
        title: 'Task needs a decision',
        reason: 'Review is pending',
        actionLabel: '',
      },
      {
        id: 'needs-session',
        kind: 'session' as const,
        title: 'Session needs a response',
        reason: 'Agent is waiting',
        actionLabel: '',
      },
      {
        id: 'needs-git',
        kind: 'git' as const,
        title: 'Git needs review',
        reason: 'Conflicts found',
        actionLabel: '',
      },
    ];
    const faulty: UiModule = {
      id: 'test.faulty-attention',
      contributions: [
        contributeTo(specificationAttentionItems, {
          id: 'test.faulty-attention.items',
          getItems: () => {
            throw new Error('Unexpected contribution failure');
          },
        }),
      ],
    };
    const healthy: UiModule = {
      id: 'test.healthy-attention',
      contributions: [
        contributeTo(specificationAttentionItems, {
          id: 'test.healthy-attention.items',
          getItems: ({ data: workspace }) =>
            workspace.attentionItems
              .filter((item) => item.kind === 'session')
              .map((item) => ({
                item,
                icon: 'file',
                action: { label: 'Open healthy session', onClick: () => undefined },
              })),
        }),
        contributeTo(specificationWorkSections, {
          id: 'test.healthy-work',
          slot: 'main',
          Component: () => <p>Other Work sections still render</p>,
        }),
      ],
    };
    const registry = createUiRegistry(
      [specificationAttentionItems, specificationWorkSections],
      [faulty, healthy],
    );
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const markup = renderToStaticMarkup(
        <UiModulesProvider modules={registry}>
          <LocalizationProvider>
            <AppShell navigation={<div>Navigation</div>}>
              <WorkspaceProvider runtime={createFakeWorkspaceRuntime()}>
                <WorkView data={{ ...data, attentionItems: runtimeAttention }} />
              </WorkspaceProvider>
            </AppShell>
          </LocalizationProvider>
        </UiModulesProvider>,
      );

      expect(log).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledWith(
        'Specification Attention contribution failed: test.faulty-attention.items',
        expect.any(Error),
      );
      expect(markup).toContain('Task needs a decision');
      expect(markup).toContain('Session needs a response');
      expect(markup).toContain('Open healthy session');
      expect(markup).toContain('Git needs review');
      expect(markup).toContain('Other Work sections still render');

      const positions = runtimeAttention.map(({ title }) => markup.indexOf(title));
      expect(positions.every((position) => position > 0)).toBe(true);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    } finally {
      log.mockRestore();
    }
  });
});
