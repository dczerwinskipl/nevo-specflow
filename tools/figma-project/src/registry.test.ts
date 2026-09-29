import { describe, expect, it } from 'vitest';
import { collectCaptureSections } from './registry';

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
});

