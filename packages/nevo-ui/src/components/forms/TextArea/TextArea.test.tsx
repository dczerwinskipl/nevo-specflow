import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TextArea, autoGrowMetrics } from './TextArea';

describe('TextArea', () => {
  it('preserves native textarea and disabled semantics', () => {
    const markup = renderToStaticMarkup(
      <TextArea aria-label="Note" disabled onChange={() => undefined} value="Context" />,
    );
    expect(markup.startsWith('<textarea')).toBe(true);
    expect(markup).toContain('aria-label="Note"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('Context');
  });

  it('bounds auto-grow height and reports internal overflow', () => {
    expect(autoGrowMetrics(42, 20, 12, 2, 4)).toEqual({ height: 52, overflowing: false });
    expect(autoGrowMetrics(140, 20, 12, 2, 4)).toEqual({ height: 92, overflowing: true });
    expect(autoGrowMetrics(42, 20, 12, 4, 2)).toEqual({ height: 92, overflowing: false });
  });
});

