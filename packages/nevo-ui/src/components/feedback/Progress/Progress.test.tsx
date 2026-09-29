import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DesignMetadataProvider } from '@nevo/figma-core/metadata';
import { Progress, normalizeProgressValue } from './Progress';
import { designSpec } from './Progress.figma';

describe('Progress', () => {
  it('clamps values and supports a custom max', () => {
    expect(normalizeProgressValue(150, 100)).toEqual({
      max: 100,
      value: 100,
      percentage: 100,
    });
    expect(normalizeProgressValue(25, 50)).toEqual({
      max: 50,
      value: 25,
      percentage: 50,
    });
  });

  it('renders standard progressbar semantics', () => {
    const html = renderToStaticMarkup(<Progress aria-label="Import progress" max={20} value={5} />);

    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="20"');
    expect(html).toContain('aria-valuenow="5"');
    expect(html).toContain('width:25%');
  });

  it('captures fill as nested structure without public slots', () => {
    const html = renderToStaticMarkup(
      <DesignMetadataProvider captureComponents={['Progress']}>
        <Progress aria-label="Import progress" value={67} />
      </DesignMetadataProvider>,
    );

    expect(designSpec.slots).toEqual({});
    expect(html).toContain('data-design-component="Progress"');
    expect(html).toContain('data-design-capture="true"');
    expect(html).toContain('data-design-key="fill"');
    expect(html).toContain('data-design-layer="fill"');
    expect(html).not.toContain('data-design-slot=');
  });
});



