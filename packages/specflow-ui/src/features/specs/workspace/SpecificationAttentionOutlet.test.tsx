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
import { tasksUiModule } from '../../tasks/uiModule';
import { gitUiModule } from '../../git/uiModule';
import { specsUiModule } from '../uiModule';
import { createFakeWorkspaceRuntime, WorkspaceProvider } from './WorkspaceContext';
import { WorkView } from './WorkView';

describe('Specification Attention source isolation', () => {
  it('keeps healthy feature entries and reports a failing contribution without using central fallback', () => {
    const data = createSpecificationWorkspaceFixture('working', 'SPEC-42');
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
            (workspace.featureAttention?.sessions ?? []).map((item) => ({
              item,
              icon: 'chat',
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
      [faulty, healthy, tasksUiModule, gitUiModule, specsUiModule],
    );
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const markup = renderToStaticMarkup(
        <UiModulesProvider modules={registry}>
          <LocalizationProvider>
            <AppShell navigation={<div>Navigation</div>}>
              <WorkspaceProvider runtime={createFakeWorkspaceRuntime()}>
                <WorkView data={data} />
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
      expect(markup).toContain('TASK-03');
      expect(markup).toContain('Open healthy session');
      expect(markup).toContain('Other Work sections still render');
      expect(markup).toContain('Some attention items could not be loaded');
    } finally {
      log.mockRestore();
    }
  });

  it('does not turn old globally-sourced domain Attention into a fallback item', () => {
    const data = createSpecificationWorkspaceFixture('empty', 'SPEC-42');
    const legacyOnly = {
      ...data,
      attentionItems: [
        {
          id: 'old-task',
          kind: 'task' as const,
          title: 'Old central Task attention',
          reason: 'Not owned by Tasks',
          actionLabel: '',
        },
      ],
    };
    const registry = createUiRegistry(
      [specificationAttentionItems, specificationWorkSections],
      [specsUiModule],
    );
    const markup = renderToStaticMarkup(
      <UiModulesProvider modules={registry}>
        <LocalizationProvider>
          <AppShell navigation={<div>Navigation</div>}>
            <WorkspaceProvider runtime={createFakeWorkspaceRuntime()}>
              <WorkView data={legacyOnly} />
            </WorkspaceProvider>
          </AppShell>
        </LocalizationProvider>
      </UiModulesProvider>,
    );
    expect(markup).not.toContain('Old central Task attention');
  });
});
