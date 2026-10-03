import { describe, expect, it } from 'vitest';
import { figmaProjectConfig } from './config';
import { collectCaptureSections, exportProfiles, validateExportProfiles } from './registry';

describe('design capture story registry', () => {
  it('collects renamed metadata from hidden technical stories', () => {
    const render = () => 'capture';
    const sections = collectCaptureSections({
      './Fixture.stories.tsx': {
        default: { title: 'Nevo UI/Forms/Fixture' },
        DesignCapture: {
          render,
          tags: ['!dev', '!autodocs'],
          parameters: {
            designCapture: {
              component: 'Fixture',
              title: 'Fixture',
              description: 'Technical capture fixture',
              kind: 'component',
              order: 2,
            },
          },
        },
      },
    });

    expect(sections).toEqual([
      {
        component: 'Fixture',
        title: 'Fixture',
        description: 'Technical capture fixture',
        kind: 'component',
        order: 2,
        render,
      },
    ]);
  });

  it('selects capture roots from explicit owner profiles instead of story presence', () => {
    const sections = collectCaptureSections(
      {
        './Owned.stories.tsx': {
          Owned: {
            render: () => 'owned',
            parameters: {
              designCapture: {
                component: 'Owned',
                title: 'Owned',
                description: 'Owned capture',
                kind: 'component',
                order: 1,
              },
            },
          },
        },
        './VisibleButUnowned.stories.tsx': {
          VisibleButUnowned: {
            render: () => 'unowned',
            parameters: {
              designCapture: {
                component: 'VisibleButUnowned',
                title: 'Visible but unowned',
                description: 'Storybook-only story',
                kind: 'component',
                order: 2,
              },
            },
          },
        },
      },
      new Set(['Owned']),
    );

    expect(sections.map((section) => section.component)).toEqual(['Owned']);
  });

  it('retains primitive resource fixtures without treating stories as component ownership', () => {
    const sections = collectCaptureSections(
      {
        './Resources.stories.tsx': {
          ResourceCapture: {
            render: () => 'resource',
            parameters: {
              designCapture: {
                component: 'Typography',
                title: 'Typography',
                description: 'Canonical resource capture',
                kind: 'primitive',
                order: 0,
              },
            },
          },
        },
      },
      new Set(['OwnedComponent']),
    );

    expect(sections.map((section) => section.component)).toEqual(['Typography']);
  });

  it('ignores obsolete metadata and stories without a render function', () => {
    expect(
      collectCaptureSections({
        './Legacy.stories.tsx': {
          Legacy: { render: () => null, parameters: { legacyCapture: { component: 'Legacy' } } },
          ArgsOnly: { parameters: { designCapture: { component: 'ArgsOnly' } } },
        },
      }),
    ).toEqual([]);
  });

  it('assigns every export root to exactly one configured owner output', () => {
    expect(() =>
      validateExportProfiles(
        [
          { id: 'one', roots: ['Owned'] },
          { id: 'two', roots: ['Owned'] },
        ],
        [{ component: 'Owned' }],
      ),
    ).toThrow(/owned by both/);

    expect(new Set(exportProfiles.map((profile) => profile.id))).toEqual(
      new Set(Object.keys(figmaProjectConfig.export.profileOutputs)),
    );
  });
});
