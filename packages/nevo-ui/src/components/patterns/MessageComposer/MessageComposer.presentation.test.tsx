import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessageComposer } from './MessageComposer';

describe('MessageComposer presentation', () => {
  it('keeps standalone chrome by default', () => {
    const html = renderToStaticMarkup(
      <MessageComposer onSubmit={() => undefined}>
        <MessageComposer.Editor aria-label="Message" />
      </MessageComposer>,
    );

    expect(html).toContain('rounded-composite');
    expect(html).toContain('border-border-default');
    expect(html).toContain('data-presentation="standalone"');
  });

  it('allows parent composites to own outer chrome', () => {
    const html = renderToStaticMarkup(
      <MessageComposer onSubmit={() => undefined} presentation="integrated">
        <MessageComposer.Editor aria-label="Message" />
      </MessageComposer>,
    );

    expect(html).toContain('rounded-none');
    expect(html).toContain('border-0');
    expect(html).toContain('bg-transparent');
    expect(html).not.toContain('bg-surface-raised');
    expect(html).toContain('data-presentation="integrated"');
  });
});
