import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '@nevo/ui';
import { describe, expect, it } from 'vitest';
import { LocalizationProvider } from '../../i18n';
import { createSpecificationWorkspaceFixture } from '../../../test-support/specs/workspace/fixtures';
import { WorkView } from '../../features/specs/workspace/WorkView';
import {
  WorkspaceProvider,
  createFakeWorkspaceRuntime,
} from '../../features/specs/workspace/WorkspaceContext';
import { builtInUiModuleRegistry } from './builtInUiModules';
import { UiModulesProvider } from './UiModulesProvider';
import type { SpecFlowUiModule } from './contracts';
import { createUiModuleRegistry } from './registry';

const moduleWithSection = (id: string, slot: 'main' | 'related'): SpecFlowUiModule => ({
  id: `example.${id}`,
  contributions: [
    {
      extensionPoint: 'specification.work.sections',
      id: `example.${id}.section`,
      slot,
      render: ({ specId }) => <section data-test-module={id}>Added for {specId}</section>,
    },
  ],
});

describe('SpecFlow UI module composition', () => {
  it('registers Tasks as a built-in feature, not as a WorkView import', () => {
    expect(builtInUiModuleRegistry.specificationWorkSections('main').map((x) => x.id)).toEqual([
      'specflow.tasks.task-groups',
    ]);
  });

  it('inserts an additional module section without changing the Work host implementation', () => {
    const data = createSpecificationWorkspaceFixture('working', 'SPEC-21');
    const registry = createUiModuleRegistry([
      moduleWithSection('first', 'related'),
      moduleWithSection('second', 'related'),
    ]);
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
    const first = markup.indexOf('data-test-module="first"');
    const second = markup.indexOf('data-test-module="second"');

    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);
    expect(markup).toContain('Added for SPEC-21');
    expect(markup).toContain('feature/session-refresh');
  });

  it('rejects duplicate module and contribution identities before rendering', () => {
    const section = moduleWithSection('a', 'main');
    expect(() => createUiModuleRegistry([section, section])).toThrow('module id');
    expect(() =>
      createUiModuleRegistry([
        section,
        {
          id: 'example.b',
          contributions: section.contributions,
        },
      ]),
    ).toThrow('contribution id');
  });

  it('keeps Work sections in their intended slot and declared registration order', () => {
    const registry = createUiModuleRegistry([
      moduleWithSection('main-1', 'main'),
      moduleWithSection('related-1', 'related'),
      moduleWithSection('main-2', 'main'),
    ]);
    expect(registry.specificationWorkSections('main').map((c) => c.id)).toEqual([
      'example.main-1.section',
      'example.main-2.section',
    ]);
    expect(registry.specificationWorkSections('related').map((c) => c.id)).toEqual([
      'example.related-1.section',
    ]);
  });
});
