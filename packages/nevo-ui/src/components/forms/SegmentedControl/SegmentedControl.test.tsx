import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SegmentedControl } from './SegmentedControl';

describe('SegmentedControl', () => {
  it('renders a horizontal single-select radiogroup', () => {
    const markup = renderToStaticMarkup(
      <SegmentedControl aria-label="View mode" defaultValue="preview">
        <SegmentedControl.Item value="preview">Preview</SegmentedControl.Item>
        <SegmentedControl.Item value="code">Code</SegmentedControl.Item>
      </SegmentedControl>,
    );

    expect(markup).toContain('role="radiogroup"');
    expect(markup).toContain('aria-orientation="horizontal"');
    expect(markup).toContain('aria-checked="true"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('bg-surface-selected text-content-primary');
    expect(markup).toContain('cursor-pointer');
  });

  it('keeps an enabled item tabbable when the controlled selection is unavailable', () => {
    const markup = renderToStaticMarkup(
      <SegmentedControl aria-label="View mode" value="missing" onValueChange={() => {}}>
        <SegmentedControl.Item disabled value="preview">
          Preview
        </SegmentedControl.Item>
        <SegmentedControl.Item value="code">Code</SegmentedControl.Item>
      </SegmentedControl>,
    );

    expect(markup.match(/tabindex="0"/g)).toHaveLength(1);
    expect(markup).toMatch(
      /data-segmented-control-value="code"[^>]*tabindex="0"|tabindex="0"[^>]*data-segmented-control-value="code"/,
    );
  });
});

