import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CrmExample, crmEnvironmentPrimary, crmIdentity } from './CrmExample';

describe('CrmExample', () => {
  it('composes the customer table and responsive workspace without bespoke controls', () => {
    const html = renderToStaticMarkup(<CrmExample width={1280} />);

    expect(html).toContain('Northstar Labs');
    expect(html).toContain('Search customers');
    expect(html).toContain('New customer');
    expect(html).toContain('lucide-users');
    expect(html).toContain('--color-action-primary');
    expect(html).toContain(`--color-brand-primary:${crmEnvironmentPrimary}`);
    expect(html).toContain('--background-image-app-base:radial-gradient');
    expect(html).toContain('w-content-xwide');
  });

  it('derives the environment seed from the example identity', () => {
    expect(crmEnvironmentPrimary).toBe(crmIdentity.coreColor);
  });
});
