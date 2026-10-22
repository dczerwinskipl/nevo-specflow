import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Switch, SwitchField } from './Switch';

describe('Switch', () => {
  it('renders switch semantics', () => {
    expect(renderToStaticMarkup(<Switch aria-label="Enabled" />)).toContain('role="switch"');
  });

  it('supports a visible label and description', () => {
    const html = renderToStaticMarkup(
      <SwitchField label="Notifications" description="Notify the account team." />,
    );
    expect(html).toContain('Notifications');
    expect(html).toContain('Notify the account team.');
  });

  it('mutes the label of an unavailable (aria-disabled) switch but not its description', () => {
    const html = renderToStaticMarkup(
      <SwitchField
        aria-disabled
        description={<span className="reason">No branches.</span>}
        label="Different branch"
      />,
    );
    expect(html).toContain('cursor-not-allowed text-content-muted');
    // The field is not faded as a whole, so the reason keeps its contrast.
    expect(html).not.toMatch(/<div class="flex[^"]*opacity-60/);
    expect(html).toContain('aria-disabled="true"');
  });

  it('merges consumer classes onto the control while keeping field layout classes', () => {
    const html = renderToStaticMarkup(
      <SwitchField className="consumer-control" fieldClassName="consumer-field" label="Enabled" />,
    );

    expect(html).toContain('consumer-field');
    expect(html).toContain('mt-0.5 consumer-control');
  });
});
