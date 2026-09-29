import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button, Icon, Typography } from '../components';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';

describe('capture-only DOM instrumentation', () => {
  it('keeps normal component DOM free of extractor identity and prop attributes', () => {
    const html = renderToStaticMarkup(<Button size="sm">Save</Button>);
    expect(html).not.toContain('data-design-component');
    expect(html).not.toContain('data-design-prop-');
    expect(html).toContain('data-design-slot="label"');
  });

  it('adds identity and props only inside the capture provider', () => {
    const html = renderToStaticMarkup(
      <DesignCaptureProvider>
        <Button disabled size="sm" variant="destructive">
          Remove
        </Button>
      </DesignCaptureProvider>,
    );
    expect(html).toContain('data-design-component="Button"');
    expect(html).toContain('data-design-prop-variant="destructive"');
    expect(html).toContain('data-design-prop-size="sm"');
    expect(html).toContain('data-design-prop-state="disabled"');
  });

  it('serializes typed resource metadata to the existing DOM contract', () => {
    const html = renderToStaticMarkup(
      <DesignCaptureProvider>
        <Icon name="search" size="sm" />
        <Typography variant="body-md">Body</Typography>
      </DesignCaptureProvider>,
    );
    expect(html).toContain('data-design-asset-ref="Icon/search/sm"');
    expect(html).toContain('data-design-asset-representation="svg-mask"');
    expect(html).toContain('data-design-text-flow="true"');
    expect(html).toContain('data-design-text-style-ref="Typography/body-md"');
  });
});



