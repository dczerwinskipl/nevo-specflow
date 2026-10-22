import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DescriptionList } from './DescriptionList';

const list = (layout?: 'aligned' | 'inline') =>
  renderToStaticMarkup(
    <DescriptionList layout={layout} aria-label="Facts">
      <DescriptionList.Item>
        <DescriptionList.Term>Base</DescriptionList.Term>
        <DescriptionList.Detail note="Quiet caveat">main</DescriptionList.Detail>
      </DescriptionList.Item>
      <DescriptionList.Item>
        <DescriptionList.Term>Folder</DescriptionList.Term>
        <DescriptionList.Detail emphasis="secondary">C:/work</DescriptionList.Detail>
      </DescriptionList.Item>
    </DescriptionList>,
  );

describe('DescriptionList', () => {
  it('renders a real description list with terms and details', () => {
    const markup = list();
    expect(markup.startsWith('<dl')).toBe(true);
    expect(markup.match(/<dt/g)).toHaveLength(2);
    expect(markup.match(/<dd/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="Facts"');
  });

  it('aligns terms in one column by default and lets items disappear into the grid', () => {
    const markup = list();
    expect(markup).toContain('grid-cols-[minmax(0,max-content)_minmax(0,1fr)]');
    expect(markup).toContain('class="contents"');
  });

  it('keeps each pair on a wrapping line in the inline layout', () => {
    const markup = list('inline');
    expect(markup).toContain('flex min-w-0 flex-wrap');
    expect(markup).not.toContain('grid-cols-[');
  });

  it('puts the note under the value and uses the emphasis text role', () => {
    const markup = list();
    expect(markup).toContain('Quiet caveat');
    expect(markup).toContain('text-content-primary');
    expect(markup).toContain('text-content-secondary');
  });
});
