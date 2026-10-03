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

  it('merges consumer classes onto the control while keeping field layout classes', () => {
    const html = renderToStaticMarkup(
      <SwitchField className="consumer-control" fieldClassName="consumer-field" label="Enabled" />,
    );

    expect(html).toContain('consumer-field');
    expect(html).toContain('mt-0.5 consumer-control');
  });
});
