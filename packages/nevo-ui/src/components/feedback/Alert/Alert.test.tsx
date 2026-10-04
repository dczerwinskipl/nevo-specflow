import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Alert } from './Alert';

describe('Alert', () => {
  it('keeps visual danger independent from live-region semantics', () => {
    const markup = renderToStaticMarkup(<Alert tone="danger">Failed</Alert>);
    expect(markup).not.toContain('role=');
    expect(markup).toContain('data-design-slot="icon"');
    expect(markup).toContain('text-status-danger');
  });

  it('supports explicit polite and assertive live-region roles for any tone', () => {
    expect(renderToStaticMarkup(<Alert role="status">Saved</Alert>)).toContain('role="status"');
    expect(
      renderToStaticMarkup(
        <Alert role="alert" tone="neutral">
          Failed
        </Alert>,
      ),
    ).toContain('role="alert"');
  });

  it('keeps the neutral tone icon-free by default', () => {
    expect(renderToStaticMarkup(<Alert tone="neutral">Notice</Alert>)).not.toContain(
      'data-design-slot="icon"',
    );
  });

  it('allows the semantic icon to be explicitly hidden', () => {
    expect(
      renderToStaticMarkup(
        <Alert icon={null} tone="success">
          Saved
        </Alert>,
      ),
    ).not.toContain('data-design-slot="icon"');
  });
});
