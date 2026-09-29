import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BreadcrumbItem, Breadcrumbs } from './Breadcrumbs';

describe('Breadcrumbs', () => {
  it('uses shared links for ancestors and a non-interactive current page', () => {
    const html = renderToStaticMarkup(
      <Breadcrumbs>
        <BreadcrumbItem href="/customers">Customers</BreadcrumbItem>
        <BreadcrumbItem href="/customers/acme">Acme</BreadcrumbItem>
      </Breadcrumbs>,
    );

    expect(html).toContain('href="/customers"');
    expect(html).toContain('text-content-secondary');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('href="/customers/acme"');
  });

  it('allows router adapters to compose their own link with the exported recipe', () => {
    const html = renderToStaticMarkup(
      <Breadcrumbs>
        <BreadcrumbItem>
          <a className="router-link" href="/projects">
            Projects
          </a>
        </BreadcrumbItem>
        <BreadcrumbItem>Current</BreadcrumbItem>
      </Breadcrumbs>,
    );

    expect(html).toContain('class="router-link"');
  });
});

